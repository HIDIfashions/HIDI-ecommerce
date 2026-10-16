import assert from 'node:assert/strict';
import {test} from 'node:test';
import {handleLookbookRemoval} from './handler.mjs';
test('Only the exact retired page redirects; commerce URLs are untouched',()=> {
  for (const path of ['/lookbook','/lookbook/']) {
    for (const method of ['GET','HEAD']) {
      const response={writeHead(status,headers){this.status=status;this.headers=headers;},end(){this.ended=true;}};
      assert(handleLookbookRemoval({method,url:path+'?from=footer'},response,path));
      assert.equal(response.status,301);assert.equal(response.headers.Location,'/collections/all');assert(response.ended);
    }
  }
  for (const path of ['/','/collections/all','/products/lookbook-kurta','/lookbook-other','/api/lookbook'])
    assert.equal(handleLookbookRemoval({method:'GET'}, {},path),false);
});
