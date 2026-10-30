import {chromium,expect} from '@playwright/test';
import {spawn} from 'node:child_process';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const base='http://127.0.0.1:3000';
const login=Object.fromEntries((await readFile('data/initial-login.txt','utf8')).split(/\r?\n/).filter(s=>s.includes(': ')).map(s=>{const i=s.indexOf(': ');return[s.slice(0,i),s.slice(i+2)];}));
const browser=await chromium.launch({headless:true}),page=await browser.newPage();let child,token,deviceId;
const label='Enrollment verification '+new Date().toISOString();await mkdir('data/tmp',{recursive:true});const reportFile=path.resolve('data/tmp/live-enrollment-'+randomUUID()+'.json');
const api=async(url,body)=>{const r=await fetch(base+'/api'+url,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return{status:r.status,data:await r.json()};};
try{
 await page.goto(base);await page.getByLabel('Email',{exact:true}).fill(login.Email);await page.getByLabel('Password',{exact:true}).fill(login.Password);const authenticated=page.waitForResponse(r=>r.url().endsWith('/api/login')&&r.request().method()==='POST');await page.getByRole('button',{name:'Sign in to ExamOS'}).click();token=(await(await authenticated).json()).token;assert.ok(token);await page.getByRole('heading',{name:'Your examination, in view.'}).waitFor();
 const before=(await api('/state')).data;assert.ok(!before.sessions.some(s=>s.status==='active'),'A live examination is active; do not add a verification device to it');
 await page.getByRole('button',{name:'Enroll a device'}).click();await page.locator('code').waitFor();const code=await page.locator('code').textContent();assert.match(code,/^[0-9a-f]{24}$/);await expect(page.getByText('Student server URL:',{exact:false})).toContainText(base);
 child=spawn('.venv/Scripts/python.exe',['tests/enrollment-agent-driver.py'],{stdio:'inherit',env:{...process.env,EXAMOS_TEST_URL:base,EXAMOS_ENROLLMENT_CODE:code,EXAMOS_ENROLLMENT_REPORT:reportFile,EXAMOS_DEVICE_LABEL:label}});const exited=new Promise(r=>child.on('exit',r));const timer=setTimeout(()=>child.kill(),30000);
 const card=page.locator('.device').filter({hasText:label});await expect(card).toContainText('Awaiting consent');await expect(page.locator('code')).toHaveText('Already used');const exitCode=await exited;clearTimeout(timer);const report=JSON.parse(await readFile(reportFile,'utf8'));deviceId=report.deviceId;assert.equal(exitCode,0);assert.equal(report.passed,true);assert.equal(report.connected,true);assert.equal(report.reconnected,true);
 const replay=await api('/enroll',{code,name:label});assert.equal(replay.data.code,'ENROLLMENT_USED');
 const after=(await api('/state')).data;assert.ok(after.devices.some(d=>d.id===deviceId));assert.ok(before.devices.every(d=>after.devices.some(x=>x.id===d.id)));assert.equal(after.devices.filter(d=>d.name===label).length,1);
 const evidence={passed:true,server:base,teacherDashboardGeneratedCode:true,actualWindowsAgentConnected:true,selectedTransport:report.selectedTransport,reconnectedWithSameDevice:true,deviceId,usedCodeRejected:replay.data.code,monitoringStarted:report.monitoring,existingDevicesPreserved:before.devices.length};await writeFile('artifacts/enrollment-live-verification.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
}finally{
 if(child&&child.exitCode===null)child.kill();
 if(deviceId&&token){const revoked=await api('/devices/'+deviceId+'/revoke',{});assert.equal(revoked.status,200);console.log('Only the newly created verification device was revoked after testing; existing devices were preserved.');}
 await browser.close();
}
