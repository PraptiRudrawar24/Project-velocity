import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const URL = process.env.PREVIEW_URL || 'http://127.0.0.1:4173';
const SHOT_DIR = process.env.SHOT_DIR || '';

function resolveBrowserExecutable() {
  if (fs.existsSync(CHROME_PATH)) return CHROME_PATH;
  if (fs.existsSync(EDGE_PATH)) return EDGE_PATH;
  throw new Error('Neither Chrome nor Edge executable found on this machine.');
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function getState(page) {
  return page.evaluate(() => {
    const getter = window.__VELOCITY_INSPECT__;
    if (!getter) return null;
    const { game, telemetry } = getter();
    return {
      isPaused: game.isPaused,
      cameraMode: game.cameraMode,
      collisionCount: game.collisionCount,
      lastCollision: game.lastCollision,
      lapCount: game.lapCount,
      speedKmh: telemetry.speedKmh,
      forwardSpeedMs: telemetry.forwardSpeedMs,
      rpm: telemetry.rpm,
      gear: telemetry.gear,
      isBraking: telemetry.isBraking,
      isReversing: telemetry.isReversing,
      isDrifting: telemetry.isDrifting,
      isHandbraking: telemetry.isHandbraking,
      groundedWheels: telemetry.groundedWheels,
      raceTimeMs: telemetry.raceTimeMs,
      worldPosition: telemetry.worldPosition,
      headingDeg: telemetry.headingDeg,
    };
  });
}

async function waitForPhysicsReady(page) {
  for (let i = 0; i < 60; i++) {
    const st = await getState(page);
    if (st && st.groundedWheels >= 4 && st.raceTimeMs > 100) {
      return st;
    }
    await sleep(150);
  }
  throw new Error('Timed out waiting for Rapier physics & vehicle grounding.');
}

async function maybeShot(page, name) {
  if (!SHOT_DIR) return;
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SHOT_DIR, name) });
}

async function run() {
  const executablePath = resolveBrowserExecutable();
  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: [
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      '--use-gl=angle',
      '--use-angle=swiftshader-webgl',
      '--enable-unsafe-swiftshader',
      '--window-size=1280,720',
    ],
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  });
  const page = await context.newPage();

  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });
  page.on('pageerror', (err) => {
    pageErrors.push(err.message || String(err));
  });

  try {
    console.log(`Navigating to ${URL}...`);
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

    await page.waitForSelector('canvas', { timeout: 15000 });
    const initial = await waitForPhysicsReady(page);
    console.log('Initial vehicle state:', {
      pos: initial.worldPosition,
      grounded: initial.groundedWheels,
      gear: initial.gear,
      camera: initial.cameraMode,
    });
    await maybeShot(page, '01-start-grid.png');

    // 1. Verify Acceleration & Forward Movement (W)
    await page.keyboard.down('KeyW');
    await sleep(2200);
    const accelState = await getState(page);
    console.log('After accelerating (W):', {
      speedKmh: accelState.speedKmh,
      gear: accelState.gear,
      rpm: accelState.rpm,
      pos: accelState.worldPosition,
    });
    assert(accelState.speedKmh > 40, `Expected speedKmh > 40, got ${accelState.speedKmh}`);
    assert(accelState.worldPosition[2] < initial.worldPosition[2] - 10, 'Expected forward -Z travel');
    assert(accelState.gear !== 'N' && accelState.gear !== 'R', `Expected forward gear, got ${accelState.gear}`);
    await maybeShot(page, '02-accelerating.png');

    // Verify DOM HUD reflects live speed & gear
    const domSpeed = Number(await page.textContent('[data-testid="hud-speed"]'));
    assert(domSpeed > 25, `Expected HUD speed > 25, got ${domSpeed}`);
    await page.keyboard.up('KeyW');

    // 2. Verify Braking (S while moving forward)
    await page.keyboard.down('KeyS');
    let observedBraking = false;
    let brakingMid = null;
    for (let i = 0; i < 15; i++) {
      await sleep(100);
      brakingMid = await getState(page);
      if (brakingMid.isBraking) {
        observedBraking = true;
        break;
      }
    }
    console.log('During braking (S):', {
      observedBraking,
      speedKmh: brakingMid?.speedKmh,
      forwardSpeedMs: brakingMid?.forwardSpeedMs,
      isBraking: brakingMid?.isBraking,
    });
    assert(observedBraking === true, 'Expected isBraking=true while holding S at speed');

    // Wait until speed slows substantially from braking, then transitions into Reverse
    let reverseState = null;
    for (let i = 0; i < 30; i++) {
      await sleep(150);
      reverseState = await getState(page);
      if (reverseState.gear === 'R' && reverseState.speedKmh >= 8) {
        break;
      }
    }
    await page.keyboard.up('KeyS');
    console.log('Reversing state:', {
      speedKmh: reverseState.speedKmh,
      gear: reverseState.gear,
      isReversing: reverseState.isReversing,
      posZ: reverseState.worldPosition[2],
    });
    assert(reverseState.gear === 'R', `Expected reverse gear R, got ${reverseState.gear}`);
    assert(reverseState.isReversing === true, 'Expected isReversing=true');
    assert(reverseState.speedKmh >= 8, `Expected reverse speed >= 8 km/h, got ${reverseState.speedKmh}`);

    // 4. Verify Reset (R)
    await page.keyboard.press('KeyR');
    let resetState = null;
    for (let i = 0; i < 15; i++) {
      await sleep(150);
      resetState = await getState(page);
      if (
        resetState.speedKmh <= 2 &&
        Math.abs(resetState.worldPosition[2] - initial.worldPosition[2]) < 1.5
      ) {
        break;
      }
    }
    console.log('After Reset (R):', {
      speedKmh: resetState.speedKmh,
      pos: resetState.worldPosition,
    });
    assert(resetState.speedKmh <= 2, `Expected speed <= 2 after reset, got ${resetState.speedKmh}`);
    assert(
      Math.abs(resetState.worldPosition[0] - initial.worldPosition[0]) < 1.0 &&
      Math.abs(resetState.worldPosition[2] - initial.worldPosition[2]) < 1.5,
      'Expected reset back onto starting grid'
    );

    // 5. Verify Steering (A left, D right)
    await page.keyboard.down('KeyW');
    await sleep(1200);
    await page.keyboard.down('KeyA');
    await sleep(1200);
    const leftSteerState = await getState(page);
    await maybeShot(page, '03-steering-left.png');
    await page.keyboard.up('KeyA');
    await page.keyboard.up('KeyW');
    console.log('After steering Left (W+A):', {
      headingDeg: leftSteerState.headingDeg,
      pos: leftSteerState.worldPosition,
    });
    assert(leftSteerState.worldPosition[0] < -1.5, `Expected negative X left shift, got ${leftSteerState.worldPosition[0]}`);
    assert(leftSteerState.headingDeg > 10 && leftSteerState.headingDeg < 175, `Expected left heading turn, got ${leftSteerState.headingDeg}`);

    // 6. Verify Handbrake Drift (SPACE + steering at speed)
    await page.keyboard.press('KeyR');
    await sleep(600);
    await page.keyboard.down('KeyW');
    await sleep(1800);
    await page.keyboard.down('KeyD');
    await page.keyboard.down('Space');
    let driftState = null;
    for (let i = 0; i < 15; i++) {
      await sleep(120);
      driftState = await getState(page);
      if (driftState.isDrifting) break;
    }
    console.log('During Handbrake Drift (W+D+Space):', {
      speedKmh: driftState.speedKmh,
      isHandbraking: driftState.isHandbraking,
      isDrifting: driftState.isDrifting,
      headingDeg: driftState.headingDeg,
    });
    assert(driftState.isDrifting === true || driftState.isHandbraking === true, 'Expected handbrake/drift activation');
    await maybeShot(page, '04-handbrake-drift.png');
    await page.keyboard.up('Space');
    await page.keyboard.up('KeyD');
    await page.keyboard.up('KeyW');

    // 7. Verify Collision Boundaries (turn right toward inner rail and drive into barrier)
    await page.keyboard.press('KeyR');
    await sleep(600);
    await page.keyboard.down('KeyW');
    await sleep(700);
    await page.keyboard.down('KeyD');
    await sleep(800);
    await page.keyboard.up('KeyD');
    for (let i = 0; i < 24; i++) {
      await sleep(200);
      const colSt = await getState(page);
      if (colSt.collisionCount > 0) break;
    }
    await page.keyboard.up('KeyW');
    const colState = await getState(page);
    console.log('After barrier collision check:', {
      collisionCount: colState.collisionCount,
      lastCollision: colState.lastCollision,
      pos: colState.worldPosition,
    });
    assert(colState.collisionCount > 0, 'Expected barrier collision to be detected');
    assert(Math.abs(colState.worldPosition[0]) < 15, 'Expected guardrail to contain vehicle within boundary');

    // Reset after collision
    await page.keyboard.press('KeyR');
    await sleep(600);

    // 8. Verify Camera Switching (C)
    assert.equal(await page.textContent('[data-testid="hud-camera-mode"]'), 'CHASE');
    await page.keyboard.press('KeyC');
    await sleep(350);
    assert.equal(await page.textContent('[data-testid="hud-camera-mode"]'), 'COCKPIT');
    await maybeShot(page, '05-cockpit-camera.png');

    await page.keyboard.press('KeyC');
    await sleep(350);
    assert.equal(await page.textContent('[data-testid="hud-camera-mode"]'), 'HOOD');
    await maybeShot(page, '06-hood-camera.png');

    await page.keyboard.press('KeyC');
    await sleep(350);
    assert.equal(await page.textContent('[data-testid="hud-camera-mode"]'), 'CHASE');

    // 9. Verify Pause & Resume (ESC + UI button + keyboard remains working afterward!)
    await page.keyboard.press('Escape');
    await sleep(300);
    const pausedState = await getState(page);
    assert.equal(pausedState.isPaused, true, 'Expected ESC to pause simulation');
    await page.waitForSelector('[data-testid="pause-overlay"]', { state: 'visible' });
    const pausedTime1 = pausedState.raceTimeMs;
    await sleep(500);
    const pausedTime2 = (await getState(page)).raceTimeMs;
    assert.equal(pausedTime1, pausedTime2, 'Expected race timer to freeze while paused');
    await maybeShot(page, '07-pause-menu.png');

    // Click Resume UI button, then click Camera UI button, then immediately test Space + W!
    await page.click('[data-testid="btn-resume"]');
    await sleep(250);
    assert.equal((await getState(page)).isPaused, false, 'Expected Resume button to unpause');

    await page.click('[data-testid="btn-camera"]');
    await sleep(150);
    assert.equal(await page.textContent('[data-testid="hud-camera-mode"]'), 'COCKPIT');

    // Pressing Space after clicking btn-camera MUST NOT trigger btn-camera again!
    await page.keyboard.press('Space');
    await sleep(150);
    assert.equal(
      await page.textContent('[data-testid="hud-camera-mode"]'),
      'COCKPIT',
      'Space must not re-activate last clicked HUD button'
    );

    // Switch back to CHASE via C key and accelerate with W to confirm keyboard works post-UI interaction
    await page.keyboard.press('KeyC');
    await page.keyboard.press('KeyC');
    await sleep(150);
    assert.equal(await page.textContent('[data-testid="hud-camera-mode"]'), 'CHASE');

    await page.keyboard.down('KeyW');
    await sleep(1400);
    const postUiAccel = await getState(page);
    await page.keyboard.up('KeyW');
    assert(postUiAccel.speedKmh > 25, `Expected W to accelerate after UI interaction, got ${postUiAccel.speedKmh}`);

    // Verify no browser scrolling occurred
    const scrollY = await page.evaluate(() => window.scrollY);
    assert.equal(scrollY, 0, 'Expected zero page scrolling during gameplay');

    // Verify zero console/page errors
    assert.deepEqual(consoleErrors, [], `Console errors occurred: ${consoleErrors.join('; ')}`);
    assert.deepEqual(pageErrors, [], `Page errors occurred: ${pageErrors.join('; ')}`);

    console.log('ALL E2E GAMEPLAY CHECKS PASSED WITH 0 ERRORS!');
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error('E2E Verification Failed:', err);
  process.exit(1);
});

