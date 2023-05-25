/*
 * Copyright (c) 2021, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import {
  getRelativeProjectPath,
  getRootWorkspacePath,
  Row,
  SourceTrackingService,
  Table
} from '@salesforce/salesforcedx-utils-vscode';
import {
  ComponentSet,
  DeployResult
} from '@salesforce/source-deploy-retrieve';
import {
  RequestStatus
} from '@salesforce/source-deploy-retrieve/lib/src/client/types';
import * as vscode from 'vscode';
import { channelService } from '../channels';
import { PersistentStorageService } from '../conflict/persistentStorageService';
import { WorkspaceContext } from '../context';
import { handleDeployDiagnostics } from '../diagnostics';
import { nls } from '../messages';
import { DeployQueue } from '../settings';
import { SfdxPackageDirectories } from '../sfdxProject';
import { DeployRetrieveExecutor } from './deployRetrieveExecutor';

export abstract class DeployExecutor<T> extends DeployRetrieveExecutor<T> {
  protected errorCollection = vscode.languages.createDiagnosticCollection(
    'deploy-errors'
  );

  protected async doOperation(
    components: ComponentSet,
    token: vscode.CancellationToken
  ): Promise<DeployResult | undefined> {
    const projectPath = getRootWorkspacePath();
    const connection = await WorkspaceContext.getInstance().getConnection();

    components.projectDirectory = projectPath;
    const sourceTracking = await SourceTrackingService.createSourceTracking(
      projectPath,
      connection
    );
    await sourceTracking.ensureLocalTracking();

    const operation = await components.deploy({
      usernameOrConnection: connection
    });

    this.setupCancellation(operation, token);

    return operation.pollStatus();
  }

  protected async postOperation(
    result: DeployResult | undefined
  ): Promise<void> {
    try {
      if (result) {
        // Update Persistent Storage for the files that were deployed
        PersistentStorageService.getInstance().setPropertiesForFilesDeploy(
          result
        );

        const relativePackageDirs = await SfdxPackageDirectories.getPackageDirectoryPaths();
        const output = this.createOutput(result, relativePackageDirs);
        channelService.appendLine(output);

        const success = result.response.status === RequestStatus.Succeeded;
        if (!success) {
          this.unsuccessfulOperationHandler(result, this.errorCollection);
        }
      }
    } finally {
      await DeployQueue.get().unlock();
    }
  }

  protected unsuccessfulOperationHandler(
    result: DeployResult,
    errorCollection: any
  ) {
    handleDeployDiagnostics(result, this.errorCollection);
  }

  private createOutput(
    result: DeployResult,
    relativePackageDirs: string[]
  ): string {
    const table = new Table();

    const rowsWithRelativePaths = (result.getFileResponses().map(response => {
      response.filePath = getRelativeProjectPath(
        response.filePath,
        relativePackageDirs
      );
      return response;
    }) as unknown) as Row[];

    let output: string;

    if (result.response.status === RequestStatus.Succeeded) {
      output = table.createTable(
        rowsWithRelativePaths,
        [
          { key: 'state', label: nls.localize('table_header_state') },
          { key: 'fullName', label: nls.localize('table_header_full_name') },
          { key: 'type', label: nls.localize('table_header_type') },
          {
            key: 'filePath',
            label: nls.localize('table_header_project_path')
          }
        ],
        nls.localize(`table_title_deployed_source`)
      );
    } else {
      output = table.createTable(
        rowsWithRelativePaths.filter(row => row.error),
        [
          {
            key: 'filePath',
            label: nls.localize('table_header_project_path')
          },
          { key: 'error', label: nls.localize('table_header_errors') }
        ],
        nls.localize(`table_title_deploy_errors`)
      );
    }

    return output;
  }
}
