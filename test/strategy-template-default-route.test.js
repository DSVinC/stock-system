#!/usr/bin/env node

const assert = require('node:assert');
const express = require('express');

function main() {
  const createStrategyTemplateRouter = require('../api/strategy-template');
  const router = createStrategyTemplateRouter(express);

  const routePaths = router.stack
    .filter((layer) => layer.route)
    .map((layer) => layer.route.path);

  const defaultIndex = routePaths.indexOf('/default');
  const profilesIndex = routePaths.indexOf('/profiles');
  const dynamicIndex = routePaths.indexOf('/:id');

  assert.notStrictEqual(defaultIndex, -1, 'router should contain /default');
  assert.notStrictEqual(profilesIndex, -1, 'router should contain /profiles');
  assert.notStrictEqual(dynamicIndex, -1, 'router should contain /:id');
  assert.ok(defaultIndex < dynamicIndex, '/default must be registered before /:id');
  assert.ok(profilesIndex < dynamicIndex, '/profiles must be registered before /:id');

  console.log('✅ strategy template default route order test passed');
}

main();
