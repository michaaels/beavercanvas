'use strict';
const path=require('node:path'),cp=require('node:child_process');
const product=process.argv[2],jdk=process.env.ECHARTS_COMPILER_JDK||process.env.JAVA_HOME,driver=process.env.ECHARTS_TEST_JDBC_DRIVER;
if(!product||!jdk||!driver||!process.env.ECHARTS_TEST_JDBC_URL)throw new Error('Pass the DBeaver product path and set ECHARTS_COMPILER_JDK, ECHARTS_TEST_JDBC_DRIVER, ECHARTS_TEST_JDBC_URL/USER/PASSWORD');
const result=cp.spawnSync(process.execPath,[path.join(__dirname,'test-plugin-registry.js'),product,'--jdbc-session'],{stdio:'inherit',timeout:120000});
if(result.error)throw result.error;if(result.status!==0)throw new Error(`Equinox JDBC session test failed (${result.status})`);
