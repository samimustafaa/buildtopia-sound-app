'use strict';
const fs=require('node:fs/promises');
const {launchUpdate}=require('../app/update-handoff.cjs');
(async()=>{
  const config=JSON.parse(await fs.readFile(process.argv[2],'utf8'));
  await launchUpdate(config);
  console.log('Production Node handoff confirmed ready. Parent exits now.');
})().catch(e=>{console.error(e);process.exitCode=1;});
