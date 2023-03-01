/*
 * Copyright (c) 2023, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import {
  ConfigUtil,
  ContinueResponse,
  SourceTrackingService
} from '@salesforce/salesforcedx-utils-vscode';
import { ComponentSet } from '@salesforce/source-deploy-retrieve';
import * as fs from 'fs';
import {
  DeployExecutor} from '../../../src/commands/baseDeployRetrieve';
import { WorkspaceContext } from '../../../src/context/workspaceContext';

const dummyProjectPath = '/a/project/path';
jest.mock('@salesforce/source-deploy-retrieve', () => {
  return {
    ...jest.requireActual('@salesforce/source-deploy-retrieve'),
    getRootWorkspacePath: () => dummyProjectPath,
    ComponentSet: jest.fn().mockImplementation(() => {
      return {
        deploy: jest.fn().mockImplementation(() => {
          return { pollStatus: jest.fn() };
        }),
        getSourceComponents: jest.fn().mockReturnValue([
          { name: '1', type: 'ApexClass' },
          { name: '2', type: 'ApexClass' }
        ])
      };
    })
  };
});

jest.mock('@salesforce/salesforcedx-utils-vscode', () => {
  return {
    ...jest.requireActual('@salesforce/salesforcedx-utils-vscode'),
    getRootWorkspacePath: () => dummyProjectPath,
    ChannelService: jest.fn().mockImplementation(() => {
      return {};
    }),
    TelemetryService: { getInstance: jest.fn() },
    TelemetryBuilder: jest.fn()
  };
});

jest.mock('../../../src/messages', () => {
  return { loadMessageBundle: jest.fn(), nls: { localize: jest.fn() } };
});

// jest.mock('../../../src/commands/baseDeployRetrieve/RetrieveExecutor');

describe('Deploy Executor', () => {
  const dummyProcessCwd = '/';
  const workspaceContextGetInstanceSpy = jest.spyOn(
    WorkspaceContext,
    'getInstance'
  );
  const mockWorkspaceContext = { getConnection: jest.fn() } as any;
  let createSourceTrackingSpy: jest.SpyInstance;
  const dummyComponentSet = new ComponentSet();
  const deploySpy = jest.spyOn(dummyComponentSet, 'deploy');

  class TestDeployExecutor extends DeployExecutor<{}> {
    protected getComponents(
      response: ContinueResponse<{}>
    ): Promise<ComponentSet> {
      return new Promise(resolve => resolve(new ComponentSet()));
    }
  }

  beforeEach(async () => {
    jest.spyOn(process, 'cwd').mockReturnValue(dummyProcessCwd);
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    workspaceContextGetInstanceSpy.mockReturnValue(mockWorkspaceContext);
    jest
      .spyOn(ConfigUtil, 'getUsername')
      .mockResolvedValue('test@username.com');
    createSourceTrackingSpy = jest
      .spyOn(SourceTrackingService, 'createSourceTracking')
      .mockResolvedValue({} as any);
    deploySpy.mockResolvedValue({ pollStatus: jest.fn() } as any);
  });

  it('should create Source Tracking before deploying', async () => {
    // Arrange
    const executor = new TestDeployExecutor('testDeploy', 'testDeployLog');
    (executor as any).setupCancellation = jest.fn();

    // Act
    await (executor as any).doOperation(dummyComponentSet, {});

    // Assert
    expect(createSourceTrackingSpy).toHaveBeenCalled();
    expect(deploySpy).toHaveBeenCalled();
    const createSourceTrackingCallOrder =
      createSourceTrackingSpy.mock.invocationCallOrder[0];
    const deployCallOrder = deploySpy.mock.invocationCallOrder[0];
    expect(createSourceTrackingCallOrder).toBeLessThan(deployCallOrder);
  });
});
