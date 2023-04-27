/*
 * Copyright (c) 2023, salesforce.com, inc.
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
  RetrieveResult
} from '@salesforce/source-deploy-retrieve';
import {
  ComponentStatus
} from '@salesforce/source-deploy-retrieve/lib/src/client/types';
import { join } from 'path';
import * as vscode from 'vscode';
import { channelService } from '../channels';
import { PersistentStorageService } from '../conflict/persistentStorageService';
import { WorkspaceContext } from '../context';
import { nls } from '../messages';
import { SfdxPackageDirectories } from '../sfdxProject';
import { DeployRetrieveExecutor } from './deployRetrieveExecutor';

export abstract class RetrieveExecutor<T> extends DeployRetrieveExecutor<T> {
  protected async doOperation(
    components: ComponentSet,
    token: vscode.CancellationToken
  ): Promise<RetrieveResult | undefined> {
    const projectPath = getRootWorkspacePath();
    const connection = await WorkspaceContext.getInstance().getConnection();
    const sourceTracking = await SourceTrackingService.createSourceTracking(
      projectPath,
      connection
    );

    const defaultOutput = join(
      projectPath,
      (await SfdxPackageDirectories.getDefaultPackageDir()) ?? ''
    );

    const operation = await components.retrieve({
      usernameOrConnection: connection,
      output: defaultOutput,
      merge: true,
      suppressEvents: false
    });

    this.setupCancellation(operation, token);

    const result: RetrieveResult = await operation.pollStatus();
    await SourceTrackingService.updateSourceTrackingAfterRetrieve(
      sourceTracking,
      result
    );

    return result;
  }

  protected async postOperation(
    result: RetrieveResult | undefined
  ): Promise<void> {
    if (result) {
      const relativePackageDirs = await SfdxPackageDirectories.getPackageDirectoryPaths();
      const output = this.createOutput(result, relativePackageDirs);
      channelService.appendLine(output);
      PersistentStorageService.getInstance().setPropertiesForFilesRetrieve(
        result.response.fileProperties
      );
    }
  }

  private createOutput(
    result: RetrieveResult,
    relativePackageDirs: string[]
  ): string {
    const successes: Row[] = [];
    const failures: Row[] = [];

    for (const response of result.getFileResponses()) {
      const asRow = (response as unknown) as Row;
      response.filePath = getRelativeProjectPath(
        response.filePath,
        relativePackageDirs
      );
      if (response.state !== ComponentStatus.Failed) {
        successes.push(asRow);
      } else {
        failures.push(asRow);
      }
    }

    return this.createOutputTable(successes, failures);
  }

  private createOutputTable(successes: Row[], failures: Row[]): string {
    const table = new Table();

    let output = '';

    if (successes.length > 0) {
      output += table.createTable(
        successes,
        [
          { key: 'fullName', label: nls.localize('table_header_full_name') },
          { key: 'type', label: nls.localize('table_header_type') },
          {
            key: 'filePath',
            label: nls.localize('table_header_project_path')
          }
        ],
        nls.localize(`lib_retrieve_result_title`)
      );
    }

    if (failures.length > 0) {
      if (successes.length > 0) {
        output += '\n';
      }
      output += table.createTable(
        failures,
        [
          { key: 'fullName', label: nls.localize('table_header_full_name') },
          { key: 'type', label: nls.localize('table_header_type') },
          { key: 'error', label: nls.localize('table_header_message') }
        ],
        nls.localize('lib_retrieve_message_title')
      );
    }

    return output;
  }
}
