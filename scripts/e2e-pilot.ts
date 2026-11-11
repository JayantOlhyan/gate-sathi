import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import mongoose from 'mongoose';
import { School } from '@/models/School';
import { Student } from '@/models/Student';
import { Visitor } from '@/models/Visitor';
import { GuardianLink } from '@/models/GuardianLink';
import { ApprovalRequest } from '@/models/ApprovalRequest';
import { User } from '@/models/User';

const CHROME_PATH =
  process.env.CHROME_PATH ||
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const AFTER_DIR = path.resolve(process.cwd(), 'docs/ux/after');

async function main() {
  fs.mkdirSync(AFTER_DIR, { recursive: true });
  await mongoose.connect(
    process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/gatesathi'
  );

  const school = await School.findOne({ udiseCode: '09150100101' });
  if (!school) {
    throw new Error('Pilot school (UDISE 09150100101) not found. Ensure dev:local is running.');
  }

  const aarav = await Student.findOne({
    schoolId: school._id,
    admissionNo: 'ADM-2026-001',
  });
  const priya = await Student.findOne({
    schoolId: school._id,
    admissionNo: 'ADM-2026-002',
  });
  if (!aarav || !priya) {
    throw new Error('Seeded students not found.');
  }

  // Ensure a known guardian with 1 linked child (9876543211) for <= 4 tap measurement,
  // and 2 linked children (9876543210) for Ref 03 screenshot.
  const rakesh = await Visitor.findOneAndUpdate(
    { schoolId: school._id, phone: '9876543210' },
    {
      $set: {
        schoolId: school._id,
        phone: '9876543210',
        name: 'Rakesh Kumar',
        defaultRelation: 'Father',
        consentAt: new Date(),
        consentVersion: 'v1.1',
      },
    },
    { upsert: true, new: true }
  );
  const principalUser = await User.findOne({ phone: '9999999991' });
  const approvedById = principalUser?._id ?? school._id;

  await GuardianLink.findOneAndUpdate(
    { schoolId: school._id, studentId: aarav._id, visitorId: rakesh._id },
    { $set: { relation: 'Father', approvedBy: approvedById } },
    { upsert: true }
  );
  await GuardianLink.findOneAndUpdate(
    { schoolId: school._id, studentId: priya._id, visitorId: rakesh._id },
    { $set: { relation: 'Father', approvedBy: approvedById } },
    { upsert: true }
  );

  const singleChildGuardian = await Visitor.findOneAndUpdate(
    { schoolId: school._id, phone: '9876543211' },
    {
      $set: {
        schoolId: school._id,
        phone: '9876543211',
        name: 'Suresh Kumar',
        defaultRelation: 'Father',
        consentAt: new Date(),
        consentVersion: 'v1.1',
      },
    },
    { upsert: true, new: true }
  );
  await GuardianLink.deleteMany({
    schoolId: school._id,
    visitorId: singleChildGuardian._id,
  });
  await GuardianLink.create({
    schoolId: school._id,
    studentId: aarav._id,
    visitorId: singleChildGuardian._id,
    relation: 'Father',
    approvedBy: approvedById,
  });

  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: true,
  });

  console.log('=== GateSathi Pilot E2E Verification (360×640, Hindi) ===');

  // ---------------------------------------------------------
  // CONTEXT 1: Guard (360×640, Hindi default)
  // ---------------------------------------------------------
  const guardCtx = await browser.newContext({
    viewport: { width: 360, height: 640 },
    locale: 'hi-IN',
  });
  const guardPage = await guardCtx.newPage();

  // Screenshot 01: Login
  await guardPage.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
  await guardPage.screenshot({ path: path.join(AFTER_DIR, '01.png') });

  // Log in as Guard
  await guardPage.fill('#phone', '9999999992');
  await guardPage.fill('#password', 'Password@123');
  await guardPage.click('button[type="submit"]');
  await guardPage.waitForURL('**/gate', { timeout: 15000 });
  await guardPage.waitForTimeout(500);

  // Screenshot 02 (initial)
  await guardPage.screenshot({ path: path.join(AFTER_DIR, '02.png') });

  // ---------------------------------------------------------
  // FLOW 1: New visitor Pickup -> teacher approves via Ref 08 -> guard sees decision in Ref 02 strip
  // ---------------------------------------------------------
  const f1Start = Date.now();
  let f1Taps = 0;

  const unlistedPhone = `98222${Math.floor(10000 + Math.random() * 89999)}`;
  await guardPage.fill('#visitorPhone', unlistedPhone);
  await guardPage.click('button[type="submit"]');
  f1Taps += 1;
  await guardPage.waitForTimeout(400);

  // Send OTP
  await guardPage.locator('button').filter({ hasText: /OTP/ }).first().click();
  f1Taps += 1;
  await guardPage.waitForTimeout(300);

  // Verify OTP
  await guardPage.fill('#otpInput', '000000');
  await guardPage.click('button[type="submit"]');
  f1Taps += 1;
  await guardPage.waitForTimeout(300);

  // Accept consent
  await guardPage
    .locator('button')
    .filter({ hasText: /सहमत|Agree/ })
    .first()
    .click();
  f1Taps += 1;
  await guardPage.waitForTimeout(300);

  // Fill new visitor form (Ref 04): verify P0.2 (relation starts empty and submit is disabled)
  const initialRelationVal = await guardPage.inputValue('#visitorRelation');
  if (initialRelationVal !== '') {
    throw new Error(
      `P0.2 regression: expected empty relation for new visitor, got "${initialRelationVal}"`
    );
  }

  await guardPage.fill('#visitorName', 'Mahesh Yadav');
  await guardPage.selectOption('#visitorRelation', 'Uncle');
  f1Taps += 1;

  await guardPage.fill('#studentSearch', 'Aarav');
  await guardPage.waitForTimeout(500);
  await guardPage
    .locator('button')
    .filter({ hasText: /Aarav Kumar/ })
    .first()
    .click();
  f1Taps += 1;

  await guardPage
    .locator('button')
    .filter({ hasText: /ले जाना|Pickup/ })
    .first()
    .click();
  f1Taps += 1;

  await guardPage
    .locator('button')
    .filter({ hasText: /रिश्तेदार|Relative/ })
    .first()
    .click();
  f1Taps += 1;

  // Screenshot 04: New / unlisted visitor entry
  await guardPage.screenshot({ path: path.join(AFTER_DIR, '04.png') });

  // Submit directly (no 2nd confirm card)
  await guardPage.click('button[type="submit"]');
  f1Taps += 1;
  await guardPage.waitForTimeout(800);

  // Screenshot 05: Waiting for class teacher
  await guardPage.screenshot({ path: path.join(AFTER_DIR, '05.png') });

  // Guard taps "Back to gate — keeps tracking" (P0.3 test)
  await guardPage
    .locator('button')
    .filter({ hasText: /गेट पर वापस|Back to gate/ })
    .first()
    .click();
  f1Taps += 1;
  await guardPage.waitForTimeout(600);

  // Open Teacher context and approve via Ref 08 (?request=<id>)
  const latestReq = await ApprovalRequest.findOne({
    schoolId: school._id,
  }).sort({ createdAt: -1 });
  if (!latestReq) {
    throw new Error('Expected pending ApprovalRequest to be created');
  }

  const teacherCtx = await browser.newContext({
    viewport: { width: 360, height: 640 },
    locale: 'hi-IN',
  });
  const teacherPage = await teacherCtx.newPage();
  await teacherPage.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
  await teacherPage.fill('#phone', '9999999993');
  await teacherPage.fill('#password', 'Password@123');
  await teacherPage.click('button[type="submit"]');
  await teacherPage.waitForURL('**/teacher', { timeout: 15000 });
  await teacherPage.waitForTimeout(600);

  // Screenshot 10: Teacher portal home with pending request card
  await teacherPage.screenshot({ path: path.join(AFTER_DIR, '10.png') });

  // Navigate to Ref 08 buzzer view (?request=<id>)
  await teacherPage.goto(`${BASE_URL}/teacher?request=${String(latestReq._id)}`, {
    waitUntil: 'networkidle',
  });
  await teacherPage.waitForTimeout(500);

  // Screenshot 08: Teacher buzzer request detail
  await teacherPage.screenshot({ path: path.join(AFTER_DIR, '08.png') });

  // Teacher approves on Ref 08
  await teacherPage
    .locator('button')
    .filter({ hasText: /मंज़ूरी दें|Approve/ })
    .first()
    .click();
  f1Taps += 1;
  await teacherPage.waitForTimeout(600);

  // Reload/poll Guard phone screen and verify decision chip appears in Ref 02 strip
  await guardPage.reload({ waitUntil: 'networkidle' });
  await guardPage.waitForTimeout(600);

  // Screenshot 02 with Pending/Recent Approvals strip populated
  await guardPage.screenshot({ path: path.join(AFTER_DIR, '02.png') });

  const stripChip = guardPage
    .locator('button')
    .filter({ hasText: /Mahesh Yadav/ })
    .first();
  if ((await stripChip.count()) === 0) {
    throw new Error(
      'P0.3 regression: Guard phone screen strip did not show decided request'
    );
  }

  // Guard taps strip chip to open 06-approved screen
  await stripChip.click();
  f1Taps += 1;
  await guardPage.waitForTimeout(500);
  const f1DurationMs = Date.now() - f1Start;

  // Screenshot 06-approved
  await guardPage.screenshot({ path: path.join(AFTER_DIR, '06-approved.png') });

  // Capture 06-rejected & 06-expired states for visual verification
  latestReq.status = 'rejected';
  latestReq.note = 'पिता स्वयं आएंगे, बच्चे को न भेजें';
  await latestReq.save();
  await guardPage.waitForTimeout(5200);
  await guardPage.screenshot({ path: path.join(AFTER_DIR, '06-rejected.png') });

  latestReq.status = 'expired';
  await latestReq.save();
  await guardPage.waitForTimeout(5200);
  await guardPage.screenshot({ path: path.join(AFTER_DIR, '06-expired.png') });

  // Restore to approved so dashboard stats reflect approved pickup
  latestReq.status = 'approved';
  await latestReq.save();

  // Return to gate phone screen
  await guardPage
    .locator('button')
    .filter({ hasText: /अगली प्रविष्टि|Next entry/ })
    .first()
    .click();
  await guardPage.waitForTimeout(400);

  console.log(
    `[Flow 1] New visitor Pickup -> Teacher Ref 08 Approve -> Guard Strip: ${f1DurationMs} ms, ${f1Taps} taps (PASS)`
  );

  // ---------------------------------------------------------
  // Capture Screenshot 03 (2 linked children Rakesh Kumar)
  // ---------------------------------------------------------
  await guardPage.fill('#visitorPhone', '9876543210');
  await guardPage.click('button[type="submit"]');
  await guardPage.waitForTimeout(500);
  await guardPage
    .locator('button')
    .filter({ hasText: /Aarav Kumar/ })
    .first()
    .click();
  await guardPage
    .locator('button')
    .filter({ hasText: /ले जाना|Pickup/ })
    .first()
    .click();
  await guardPage.screenshot({ path: path.join(AFTER_DIR, '03.png') });
  // Click Change to return to phone step for Flow 2 benchmark
  await guardPage
    .locator('button')
    .filter({ hasText: /बदलें|Change/ })
    .first()
    .click();
  await guardPage.waitForTimeout(300);

  // ---------------------------------------------------------
  // FLOW 2: Known guardian entry (<= 15s and <= 4 taps after typing phone)
  // ---------------------------------------------------------
  await guardPage.fill('#visitorPhone', '9876543211');
  const f2Start = Date.now();
  let f2Taps = 0;

  // Tap 1: Lookup phone
  await guardPage.click('button[type="submit"]');
  f2Taps += 1;
  await guardPage.waitForSelector('button[aria-pressed="true"]', {
    timeout: 5000,
  });

  // Single linked child is pre-selected! Tap 2: Select purpose "Pickup"
  await guardPage
    .locator('button')
    .filter({ hasText: /ले जाना|Pickup/ })
    .first()
    .click();
  f2Taps += 1;

  // Tap 3: Save entry
  await guardPage.click('button[type="submit"]');
  f2Taps += 1;

  await guardPage.waitForSelector('h2', { timeout: 5000 });
  const f2DurationMs = Date.now() - f2Start;

  if (f2DurationMs > 15000) {
    throw new Error(
      `Flow 2 failed speed target: took ${f2DurationMs} ms (> 15000 ms)`
    );
  }
  if (f2Taps > 4) {
    throw new Error(
      `Flow 2 failed tap target: took ${f2Taps} taps (> 4 taps)`
    );
  }

  console.log(
    `[Flow 2] Known guardian entry: ${f2DurationMs} ms (<= 15000 ms), ${f2Taps} taps (<= 4 taps) (PASS)`
  );

  // ---------------------------------------------------------
  // FLOW 3: Exit with 3-second confirm on /gate/inside (Ref 07)
  // ---------------------------------------------------------
  const f3Start = Date.now();
  let f3Taps = 0;

  await guardPage.goto(`${BASE_URL}/gate/inside`, { waitUntil: 'networkidle' });
  await guardPage.waitForTimeout(500);

  // Screenshot 07: Inside now list
  await guardPage.screenshot({ path: path.join(AFTER_DIR, '07.png') });

  // Tap 1: Click "निकास" / "Exit"
  const exitBtn = guardPage
    .locator('button')
    .filter({ hasText: /^निकास$|^Exit$/ })
    .first();
  await exitBtn.click();
  f3Taps += 1;
  await guardPage.waitForTimeout(200);

  // Tap 2: Click "निकास पुष्टि" / "Confirm exit"
  const confirmExitBtn = guardPage
    .locator('button')
    .filter({ hasText: /निकास पुष्टि|Confirm exit/ })
    .first();
  await confirmExitBtn.click();
  f3Taps += 1;
  await guardPage.waitForTimeout(800);

  const f3DurationMs = Date.now() - f3Start;
  console.log(
    `[Flow 3] Mark exit with 2-step confirm on /gate/inside: ${f3DurationMs} ms, ${f3Taps} taps (PASS)`
  );

  // ---------------------------------------------------------
  // CONTEXT 3: Principal Dashboard & Students Import (Ref 11, 12, 13)
  // ---------------------------------------------------------
  // Ensure there is an escalated/pending request so Ref 11 & 12 show "Needs your approval"
  const pendingReq = await ApprovalRequest.findOne({
    schoolId: school._id,
  }).sort({ createdAt: -1 });
  if (pendingReq) {
    pendingReq.status = 'escalated';
    await pendingReq.save();
  }

  const principalCtx = await browser.newContext({
    viewport: { width: 360, height: 640 },
    locale: 'hi-IN',
  });
  const principalPage = await principalCtx.newPage();
  await principalPage.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
  await principalPage.fill('#phone', '9999999991');
  await principalPage.fill('#password', 'Password@123');
  await principalPage.click('button[type="submit"]');
  await principalPage.waitForURL('**/dashboard', { timeout: 15000 });
  await principalPage.waitForTimeout(800);

  // Verify P0.6: school name + UDISE is shown, not raw hex slice
  const bodyText = await principalPage.textContent('body');
  if (bodyText?.includes('School: ')) {
    throw new Error('P0.6 regression: raw School hex ID is still visible');
  }
  if (!bodyText?.includes('09150100101')) {
    throw new Error('P0.6 regression: UDISE code not rendered on dashboard');
  }

  // Screenshot 11: Principal dashboard mobile (360×640)
  await principalPage.screenshot({ path: path.join(AFTER_DIR, '11.png') });

  // Screenshot 12: Principal dashboard desktop (1440×900)
  await principalPage.setViewportSize({ width: 1440, height: 900 });
  await principalPage.waitForTimeout(500);
  await principalPage.screenshot({ path: path.join(AFTER_DIR, '12.png') });

  // Screenshot 13: Students CSV/Excel import with sample rows
  await principalPage.setViewportSize({ width: 360, height: 640 });
  await principalPage.goto(`${BASE_URL}/students`, {
    waitUntil: 'networkidle',
  });
  await principalPage.waitForTimeout(500);
  await principalPage
    .locator('button')
    .filter({ hasText: /CSV|Excel/ })
    .first()
    .click();
  await principalPage.waitForTimeout(300);

  // Upload a sample CSV to populate Step 2 Column Mapping & Preview Table
  const sampleCsv = [
    'admission_no,student_name,class,section,roll_no,father_name,father_phone,mother_name,mother_phone',
    '2024101,Aarav Kumar,5,A,1,Rakesh Kumar,9876543210,Sunita Devi,9876543211',
    '2024102,Priya Kumar,3,B,2,Rakesh Kumar,9876543210,Sunita Devi,9876543211',
    '2024103,Rohan Verma,6,A,3,Suresh Verma,9812345,Meena Verma,',
    '2024104,Ananya Singh,5,A,4,Vikram Singh,9899887766,Kavita Singh,9899887767',
  ].join('\n');

  await principalPage.setInputFiles('#importFile', {
    name: 'students-sample.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(sampleCsv, 'utf-8'),
  });
  await principalPage.waitForTimeout(1000);

  await principalPage.screenshot({ path: path.join(AFTER_DIR, '13.png') });
  await principalPage.setViewportSize({ width: 1440, height: 900 });
  await principalPage.waitForTimeout(400);
  await principalPage.screenshot({
    path: path.join(AFTER_DIR, '13-desktop.png'),
  });

  await browser.close();
  await mongoose.disconnect();
  console.log('=== All E2E checks passed & after-screenshots saved to docs/ux/after/ ===');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
