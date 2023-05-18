/*
 * Copyright (c) 2023, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import { ComponentSet } from '@salesforce/source-deploy-retrieve';
import { MetadataCacheService } from '../../../src/conflict';
import { WorkspaceContext } from '../../../src/context';
import * as sdrUtils from '../../../src/services/sdr/componentSetUtils';

describe('MetadataCacheService', () => {
  let getSourceComponentsStub: jest.SpyInstance;
  let retrieveStub: jest.SpyInstance;

  describe('createRetrieveOperation', () => {
    const dummyComponentSet = new ComponentSet([
      { fullName: 'Test', type: 'apexclass' },
      { fullName: 'Test2', type: 'layout' }
    ]);
    const dummyEmptyComponentSet = new ComponentSet([]);
    let workspaceContextStub: jest.SpyInstance;
    let setApiVersionOnStub: jest.SpyInstance;

    beforeEach(() => {
      workspaceContextStub = jest
        .spyOn(WorkspaceContext, 'getInstance')
        .mockReturnValue({
          getConnection: async () => {
            return {};
          }
        } as any);
      getSourceComponentsStub = jest.spyOn(
        MetadataCacheService.prototype,
        'getSourceComponents'
      );
      setApiVersionOnStub = jest
        .spyOn(sdrUtils, 'setApiVersionOn')
        .mockImplementation(jest.fn());
      retrieveStub = jest
        .spyOn(dummyComponentSet, 'retrieve')
        .mockResolvedValue({} as any);
    });

    it('should use the suppressEvents option to retrieve files with conflicts', async () => {
      getSourceComponentsStub.mockResolvedValue(dummyComponentSet);
      const metadataCacheService = new MetadataCacheService('');

      const retrieveOperation = await metadataCacheService.createRetrieveOperation();

      expect(workspaceContextStub).toHaveBeenCalled();
      expect(getSourceComponentsStub).toHaveBeenCalled();
      expect(setApiVersionOnStub).toHaveBeenCalledWith(dummyComponentSet);
      const dummyRetrieveOptionsWithSuppressEvents = { suppressEvents: true };
      expect(retrieveStub).toHaveBeenCalledWith(
        expect.objectContaining(dummyRetrieveOptionsWithSuppressEvents)
      );
    });

    describe('loadCache', () => {
      it('should exit quickly if there is nothing to retrieve', async () => {
        getSourceComponentsStub.mockResolvedValue(dummyEmptyComponentSet);
        const metadataCacheService = new MetadataCacheService('');

        const cacheResult = await metadataCacheService.loadCache('', '');

        expect(getSourceComponentsStub).toHaveBeenCalled();
        expect(retrieveStub).not.toHaveBeenCalled();
      });
    });
  });
});
