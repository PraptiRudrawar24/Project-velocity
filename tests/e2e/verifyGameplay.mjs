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
    const { game, telemetry, racers, progress, trackNavigation } = getter();
    return {
      appScreen: game.appScreen,
      credits: game.credits,
      selectedVehicleId: game.selectedVehicleId,
      ownedVehicleIds: game.ownedVehicleIds,
      ownedCosmeticKeys: game.ownedCosmeticKeys,
      vehicleUpgrades: game.vehicleUpgrades,
      vehicleCustomizations: game.vehicleCustomizations,
      racePhase: game.racePhase,
      countdownText: game.countdownText,
      raceMode: game.raceConfig.mode,
      difficulty: game.raceConfig.difficulty,
      opponentCount: game.raceConfig.opponentCount,
      totalRacers: game.totalRacers,
      playerPosition: game.playerPosition,
      lapCount: game.lapCount,
      totalLaps: game.totalLaps,
      currentSector: game.currentSector,
      bestLapMs: game.bestLapMs,
      isWrongWay: game.isWrongWay,
      raceResult: game.raceResult,
      isPaused: game.isPaused,
      isMuted: game.isMuted,
      cameraMode: game.cameraMode,
      collisionCount: game.collisionCount,
      lastCollision: game.lastCollision,
      speedKmh: telemetry.speedKmh,
      forwardSpeedMs: telemetry.forwardSpeedMs,
      rpm: telemetry.rpm,
      gear: telemetry.gear,
      isBraking: telemetry.isBraking,
      isReversing: telemetry.isReversing,
      isDrifting: telemetry.isDrifting,
      driftIntensity: telemetry.driftIntensity,
      isHandbraking: telemetry.isHandbraking,
      groundedWheels: telemetry.groundedWheels,
      raceTimeMs: telemetry.raceTimeMs,
      worldPosition: telemetry.worldPosition,
      headingDeg: telemetry.headingDeg,
      racers,
      progress,
      trackNavigation,
    };
  });
}

async function waitForWorldReady(page) {
  for (let i = 0; i < 60; i++) {
    const st = await getState(page);
    if (st && st.groundedWheels >= 4) {
      return st;
    }
    await sleep(150);
  }
  throw new Error('Timed out waiting for Rapier physics & vehicle grounding.');
}

async function waitForRacingPhase(page) {
  for (let i = 0; i < 80; i++) {
    const st = await getState(page);
    if (st && st.racePhase === 'racing' && st.raceTimeMs > 100) {
      return st;
    }
    await sleep(150);
  }
  throw new Error('Timed out waiting for countdown to transition to racing.');
}

async function maybeShot(page, name) {
  if (!SHOT_DIR) return;
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SHOT_DIR, name) });
}

function signedAngleDiffDeg(targetDeg, currentDeg) {
  let diff = ((targetDeg - currentDeg + 540) % 360) - 180;
  return diff;
}

async function driveFullLap(page) {
  let leftHeld = false;
  let rightHeld = false;
  let wHeld = false;
  const maxMs = 155000;
  const startWall = Date.now();
  let lastLogAt = startWall;
  const seenCheckpoints = new Set();

  try {
    await page.keyboard.down('KeyW');
    wHeld = true;

    while (Date.now() - startWall < maxMs) {
      const st = await getState(page);
      if (st.currentSector > 0) {
        seenCheckpoints.add(st.currentSector);
      }
      if (st.racePhase === 'finished') {
        return { finished: true, seenCheckpoints: Array.from(seenCheckpoints), state: st };
      }
      if (Date.now() - lastLogAt > 12000) {
        lastLogAt = Date.now();
        console.log('  lap progress:', {
          elapsedSec: Math.round((lastLogAt - startWall) / 1000),
          frameIndex: st.trackNavigation.frameIndex,
          sector: st.currentSector,
          speedKmh: Math.round(st.speedKmh),
        });
      }

      // Note: headingDeg uses atan2(-fwdX, -fwdZ), so +headingDeg turns LEFT (A)
      const diff = signedAngleDiffDeg(
        st.trackNavigation.lookaheadHeadingDeg,
        st.headingDeg
      );

      // Keep speed brisk yet controllable for SwiftShader ~10-15fps loop
      if (st.speedKmh > 122 && wHeld) {
        await page.keyboard.up('KeyW');
        wHeld = false;
      } else if (st.speedKmh < 96 && !wHeld) {
        await page.keyboard.down('KeyW');
        wHeld = true;
      }

      if (diff > 6) {
        if (rightHeld) {
          await page.keyboard.up('KeyD');
          rightHeld = false;
        }
        if (!leftHeld) {
          await page.keyboard.down('KeyA');
          leftHeld = true;
        }
      } else if (diff < -6) {
        if (leftHeld) {
          await page.keyboard.up('KeyA');
          leftHeld = false;
        }
        if (!rightHeld) {
          await page.keyboard.down('KeyD');
          rightHeld = true;
        }
      } else {
        if (leftHeld) {
          await page.keyboard.up('KeyA');
          leftHeld = false;
        }
        if (rightHeld) {
          await page.keyboard.up('KeyD');
          rightHeld = false;
        }
      }

      await sleep(80);
    }

    throw new Error(`Did not finish lap within ${maxMs}ms`);
  } finally {
    if (leftHeld) await page.keyboard.up('KeyA');
    if (rightHeld) await page.keyboard.up('KeyD');
    if (wHeld) await page.keyboard.up('KeyW');
  }
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
    await waitForWorldReady(page);

    // 1. Verify Main Menu, Credits & Milestone 04 Garage Flow
    await page.waitForSelector('[data-testid="race-menu"]', { state: 'visible' });
    const initialCreditsText = await page.textContent('[data-testid="menu-credits"]');
    assert(initialCreditsText?.includes('2,000 CR'), `Expected 2,000 CR on menu, got ${initialCreditsText}`);
    assert.equal(
      (await page.textContent('[data-testid="menu-selected-vehicle"]'))?.trim(),
      'Veloce GT-R Concept'
    );
    await maybeShot(page, '01-race-menu.png');

    // Open Garage from Main Menu
    await page.click('[data-testid="btn-open-garage"]');
    await page.waitForSelector('[data-testid="garage-screen"]', { state: 'visible' });
    assert.equal((await getState(page)).appScreen, 'garage');
    await sleep(450);

    // Drag canvas slightly to exercise smooth OrbitControls
    await page.mouse.move(740, 380);
    await page.mouse.down();
    await page.mouse.move(860, 360, { steps: 8 });
    await page.mouse.up();
    await sleep(250);
    await maybeShot(page, '01b-garage-home.png');

    // Vehicles tab: verify insufficient funds blocks purchasing Stratos RS Coupe (3,200 CR)
    await page.click('[data-testid="garage-tab-vehicles"]');
    await page.waitForSelector('[data-testid="garage-vehicles-panel"]', { state: 'visible' });
    await page.click('[data-testid="btn-buy-vehicle-stratos-rs"]');
    await page.waitForSelector('[data-testid="garage-feedback"]', { state: 'visible' });
    assert.equal(await page.locator('[data-testid="purchase-confirm-modal"]').count(), 0);
    assert.equal((await getState(page)).credits, 2000);

    // Switch preview back to owned starter car & test Customization + Confirmation Modal
    await page.click('[data-testid="vehicle-card-apex-gt-r"]');
    await page.click('[data-testid="garage-tab-customize"]');
    await page.waitForSelector('[data-testid="garage-customize-panel"]', { state: 'visible' });

    // Cancel flow leaves credits unchanged
    await page.click('[data-testid="cosmetic-wheels-twin-spoke"]');
    await page.waitForSelector('[data-testid="purchase-confirm-modal"]', { state: 'visible' });
    await page.click('[data-testid="btn-cancel-purchase"]');
    assert.equal((await getState(page)).credits, 2000);

    // Purchase Glacier Pearl paint (200 CR)
    await page.click('[data-testid="cosmetic-paint-pearl"]');
    await page.waitForSelector('[data-testid="purchase-confirm-modal"]', { state: 'visible' });
    await page.click('[data-testid="btn-confirm-purchase"]');
    await sleep(200);
    const afterPaint = await getState(page);
    assert.equal(afterPaint.credits, 1800);
    assert.equal(afterPaint.vehicleCustomizations['apex-gt-r'].paintId, 'pearl');
    await maybeShot(page, '01c-garage-customized.png');

    // Test Upgrades tab (Stage 1 Brakes = 400 CR -> 1400 CR? Wait: save credits for Stratos unlock after 2 Time Trials, check Cancel modal on Engine)
    await page.click('[data-testid="garage-tab-upgrades"]');
    await page.waitForSelector('[data-testid="garage-upgrades-panel"]', { state: 'visible' });
    await page.click('[data-testid="btn-upgrade-engine"]');
    await page.waitForSelector('[data-testid="purchase-confirm-modal"]', { state: 'visible' });
    await page.click('[data-testid="btn-cancel-purchase"]');
    assert.equal((await getState(page)).credits, 1800);

    // Return to Race Menu
    await page.click('[data-testid="btn-garage-back"]');
    await page.waitForSelector('[data-testid="race-menu"]', { state: 'visible' });
    assert.equal((await getState(page)).appScreen, 'race');

    await page.click('[data-testid="mode-quick_race"]');
    await page.click('[data-testid="diff-easy"]');
    await page.click('[data-testid="opponents-3"]');
    await page.click('[data-testid="laps-2"]');
    await page.click('[data-testid="btn-start-race"]');

    // 2. Verify Countdown (3, 2, 1, GO!)
    const countdownStart = await getState(page);
    assert.equal(countdownStart.racePhase, 'countdown');
    assert.equal(countdownStart.raceTimeMs, 0, 'Timer must stay at 0 during countdown');
    await page.waitForSelector('[data-testid="hud-countdown"]', { state: 'visible' });
    assert.equal(await page.textContent('[data-testid="hud-position"]'), '4/4');
    assert.equal(await page.textContent('[data-testid="hud-lap"]'), '1/2');
    await maybeShot(page, '02-countdown.png');

    await waitForRacingPhase(page);
    await sleep(4500);
    const easyRaceSnap = await getState(page);
    const easyAiCars = easyRaceSnap.racers.filter((r) => r.id !== 'player');
    assert.equal(easyAiCars.length, 3, 'Expected 3 AI opponents in Quick Race');
    const easyLeadSpeed = Math.max(...easyAiCars.map((r) => r.speedMs));
    console.log('Easy AI pack after 4.5s:', {
      leadSpeedMs: easyLeadSpeed.toFixed(1),
      positionsZ: easyAiCars.map((r) => Math.round(r.position[2])),
    });
    assert(easyLeadSpeed > 18, `Expected Easy AI cars to drive forward, leadSpeed=${easyLeadSpeed}`);
    await maybeShot(page, '03-quick-race-pack.png');

    // 3. Verify Circuit Race & Hard Difficulty (5 AI) shows noticeably faster AI pace
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-testid="btn-pause-menu"]', { state: 'visible' });
    await page.click('[data-testid="btn-pause-menu"]');
    await page.waitForSelector('[data-testid="race-menu"]', { state: 'visible' });

    await page.click('[data-testid="mode-circuit_race"]');
    await page.click('[data-testid="diff-hard"]');
    await page.click('[data-testid="opponents-5"]');
    await page.click('[data-testid="laps-3"]');
    await page.click('[data-testid="btn-start-race"]');

    await waitForRacingPhase(page);
    assert.equal(await page.textContent('[data-testid="hud-position"]'), '6/6');
    assert.equal(await page.textContent('[data-testid="hud-lap"]'), '1/3');
    await sleep(4500);
    const hardRaceSnap = await getState(page);
    const hardAiCars = hardRaceSnap.racers.filter((r) => r.id !== 'player');
    assert.equal(hardAiCars.length, 5, 'Expected 5 AI opponents in Circuit Race');
    const hardLeadSpeed = Math.max(...hardAiCars.map((r) => r.speedMs));
    console.log('Hard AI pack after 4.5s:', {
      leadSpeedMs: hardLeadSpeed.toFixed(1),
      positionsZ: hardAiCars.map((r) => Math.round(r.position[2])),
    });
    assert(
      hardLeadSpeed > easyLeadSpeed + 3,
      `Expected Hard AI (${hardLeadSpeed.toFixed(1)} m/s) faster than Easy AI (${easyLeadSpeed.toFixed(1)} m/s)`
    );

    // 4. Switch to Time Trial (0 AI opponents, 1 lap) for Vehicle Physics + Full Lap + Results
    await page.keyboard.press('Escape');
    await page.click('[data-testid="btn-pause-menu"]');
    await page.waitForSelector('[data-testid="race-menu"]', { state: 'visible' });

    await page.click('[data-testid="mode-time_trial"]');
    await page.click('[data-testid="laps-1"]');
    await page.click('[data-testid="btn-start-race"]');
    const ttStart = await waitForRacingPhase(page);
    assert.equal(ttStart.totalRacers, 1, 'Time Trial must have 0 AI opponents');
    assert.equal(await page.textContent('[data-testid="hud-position"]'), 'SOLO');

    // 5. Verify Vehicle Acceleration, Braking, Reverse, Reset (Milestone 1 & 2 regression)
    await page.keyboard.down('KeyW');
    await sleep(2000);
    const accelState = await getState(page);
    assert(accelState.speedKmh > 40, `Expected speedKmh > 40, got ${accelState.speedKmh}`);
    await page.keyboard.up('KeyW');

    await page.keyboard.down('KeyS');
    let observedBraking = false;
    for (let i = 0; i < 15; i++) {
      await sleep(100);
      if ((await getState(page)).isBraking) {
        observedBraking = true;
        break;
      }
    }
    assert(observedBraking, 'Expected braking state on S at speed');
    let revState = null;
    for (let i = 0; i < 30; i++) {
      await sleep(150);
      revState = await getState(page);
      if (revState.gear === 'R' && revState.speedKmh >= 8) break;
    }
    await page.keyboard.up('KeyS');
    assert.equal(revState.gear, 'R');

    // Reset to grid
    await page.keyboard.press('KeyR');
    await sleep(600);
    const resetState = await getState(page);
    assert(resetState.speedKmh <= 2);

    // 6. Verify Steering, Handbrake Drift & Recovery, Collision, Camera, Pause, Audio
    await page.keyboard.down('KeyW');
    await sleep(1500);
    await page.keyboard.down('KeyD');
    await page.keyboard.down('Space');
    let drifted = false;
    for (let i = 0; i < 15; i++) {
      await sleep(120);
      const ds = await getState(page);
      if (ds.isDrifting && ds.driftIntensity > 0.2) {
        drifted = true;
        break;
      }
    }
    assert(drifted, 'Expected active handbrake drift');
    await maybeShot(page, '04-handbrake-drift.png');
    await page.keyboard.up('Space');
    await page.keyboard.up('KeyD');
    await page.keyboard.up('KeyW');

    // Wrong-way detection check: move slightly right, then low-speed U-turn left to face +Z
    await page.keyboard.press('KeyR');
    await sleep(500);
    await page.keyboard.down('KeyW');
    await page.keyboard.down('KeyD');
    await sleep(550);
    await page.keyboard.up('KeyD');
    await page.keyboard.up('KeyW');
    await page.keyboard.down('KeyA');
    let throttleHeld = false;
    for (let i = 0; i < 65; i++) {
      const ww = await getState(page);
      if (ww.headingDeg >= 150 && ww.headingDeg <= 215) break;
      if (ww.speedKmh < 20 && !throttleHeld) {
        await page.keyboard.down('KeyW');
        throttleHeld = true;
      } else if (ww.speedKmh > 28 && throttleHeld) {
        await page.keyboard.up('KeyW');
        throttleHeld = false;
      }
      await sleep(100);
    }
    if (throttleHeld) await page.keyboard.up('KeyW');
    await page.keyboard.up('KeyA');
    await page.keyboard.down('KeyW');
    for (let i = 0; i < 30; i++) {
      await sleep(120);
      const ww = await getState(page);
      if (ww.isWrongWay) break;
    }
    const wrongWayState = await getState(page);
    await maybeShot(page, '05-wrong-way.png');
    await page.keyboard.up('KeyW');
    assert.equal(wrongWayState.isWrongWay, true, 'Expected Wrong-Way warning when driving backward on circuit');

    // Reset back upright on start grid
    await page.keyboard.press('KeyR');
    await sleep(500);

    // Camera switch C
    await page.keyboard.press('KeyC');
    await sleep(500);
    assert.equal(await page.textContent('[data-testid="hud-camera-mode"]'), 'COCKPIT');
    await page.keyboard.press('KeyC');
    await sleep(500);
    assert.equal(await page.textContent('[data-testid="hud-camera-mode"]'), 'HOOD');
    await page.keyboard.press('KeyC');
    await sleep(500);
    assert.equal(await page.textContent('[data-testid="hud-camera-mode"]'), 'CHASE');

    // Audio mute toggle M & Pause/Resume
    await page.keyboard.press('KeyM');
    await sleep(120);
    assert.equal(await page.textContent('[data-testid="hud-audio-state"]'), 'MUTED');
    await page.keyboard.press('KeyM');
    await sleep(120);
    assert.equal(await page.textContent('[data-testid="hud-audio-state"]'), 'SFX ON');

    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-testid="pause-overlay"]', { state: 'visible' });
    await page.click('[data-testid="btn-resume"]');
    await sleep(200);
    assert.equal((await getState(page)).isPaused, false);

    // 7. Clean restart via Pause menu -> drive full 1-lap Time Trial across checkpoints -> Results Screen
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-testid="pause-overlay"]', { state: 'visible' });
    await page.click('[data-testid="btn-pause-restart"]');
    await waitForRacingPhase(page);
    console.log('Driving full Time Trial lap to verify checkpoints & Results screen...');
    const lapResult = await driveFullLap(page);
    console.log('Full lap completed:', {
      checkpoints: lapResult.seenCheckpoints,
      raceResult: lapResult.state.raceResult,
    });
    assert(lapResult.seenCheckpoints.length >= 4, 'Expected sequential checkpoints 1..5 to be recorded');

    await page.waitForSelector('[data-testid="results-overlay"]', { state: 'visible' });
    const resBest = await page.textContent('[data-testid="results-best-lap"]');
    const resLaps = await page.textContent('[data-testid="results-laps"]');
    const resEarned = await page.textContent('[data-testid="results-credits-earned"]');
    assert(resBest && resBest !== '--:--.--', `Expected valid best lap time, got ${resBest}`);
    assert.equal(resLaps?.trim(), '1 / 1');
    assert(resEarned?.includes('950 CR'), `Expected +950 CR Time Trial payout, got ${resEarned}`);
    assert.equal((await getState(page)).credits, 2750);
    await maybeShot(page, '06-results-screen.png');

    // Verify Restart Race from Results Screen resets everything cleanly
    await page.click('[data-testid="btn-results-restart"]');
    await sleep(300);
    const restarted = await getState(page);
    assert.equal(restarted.racePhase, 'countdown', 'Expected Restart to re-enter countdown');
    assert.equal(restarted.lapCount, 1);
    assert.equal(restarted.raceTimeMs, 0);

    // 8. Verify Save Persistence Across Browser Reload & Unlock/Select/Race New Vehicle
    console.log('Verifying browser reload persistence & unlocking Stratos RS Coupe...');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('canvas', { timeout: 15000 });
    await waitForWorldReady(page);
    const reloaded = await getState(page);
    assert.equal(reloaded.credits, 2750, 'Expected saved credits to persist across reload');
    assert.equal(
      reloaded.vehicleCustomizations['apex-gt-r'].paintId,
      'pearl',
      'Expected saved paint customization to persist across reload'
    );

    // Earn >= 650 CR in a second 1-lap Time Trial so balance reaches >= 3,400 CR
    await page.click('[data-testid="mode-time_trial"]');
    await page.click('[data-testid="laps-1"]');
    await page.click('[data-testid="btn-start-race"]');
    await waitForRacingPhase(page);
    await driveFullLap(page);
    await page.waitForSelector('[data-testid="results-overlay"]', { state: 'visible' });
    const postTt2Credits = (await getState(page)).credits;
    assert(postTt2Credits >= 3400, `Expected >= 3400 CR after 2nd Time Trial, got ${postTt2Credits}`);

    // Open Garage directly from Results Screen, purchase & equip Stratos RS Coupe (3,200 CR)
    await page.click('[data-testid="btn-results-garage"]');
    await page.waitForSelector('[data-testid="garage-screen"]', { state: 'visible' });
    await page.click('[data-testid="garage-tab-vehicles"]');
    await page.click('[data-testid="btn-buy-vehicle-stratos-rs"]');
    await page.waitForSelector('[data-testid="purchase-confirm-modal"]', { state: 'visible' });
    await page.click('[data-testid="btn-confirm-purchase"]');
    await sleep(300);
    const afterBuyCar = await getState(page);
    assert(afterBuyCar.ownedVehicleIds.includes('stratos-rs'), 'Expected Stratos RS owned');
    assert.equal(afterBuyCar.selectedVehicleId, 'stratos-rs', 'Expected Stratos RS selected');
    assert.equal(afterBuyCar.credits, postTt2Credits - 3200);
    await maybeShot(page, '07-garage-stratos-unlocked.png');

    // Return to Race Menu and verify Stratos RS Coupe spawns & drives cleanly on track
    await page.click('[data-testid="btn-garage-back"]');
    await page.waitForSelector('[data-testid="race-menu"]', { state: 'visible' });
    assert.equal(
      (await page.textContent('[data-testid="menu-selected-vehicle"]'))?.trim(),
      'Stratos RS Coupe'
    );
    await page.click('[data-testid="mode-time_trial"]');
    await page.click('[data-testid="laps-1"]');
    await page.click('[data-testid="btn-start-race"]');
    await waitForRacingPhase(page);
    await page.keyboard.down('KeyW');
    await sleep(2000);
    const stratosDrive = await getState(page);
    await page.keyboard.up('KeyW');
    assert.equal(stratosDrive.selectedVehicleId, 'stratos-rs');
    assert(stratosDrive.groundedWheels >= 4, 'Expected Stratos RS grounded on all 4 wheels');
    assert(stratosDrive.speedKmh > 40, `Expected Stratos RS to accelerate > 40 km/h, got ${stratosDrive.speedKmh}`);
    await maybeShot(page, '08-stratos-on-track.png');

    // Zero scroll & zero console/page errors
    const scrollY = await page.evaluate(() => window.scrollY);
    assert.equal(scrollY, 0, 'Expected zero browser scroll');
    assert.deepEqual(consoleErrors, [], `Console errors: ${consoleErrors.join('; ')}`);
    assert.deepEqual(pageErrors, [], `Page errors: ${pageErrors.join('; ')}`);

    console.log('ALL MILESTONE 01-04 E2E ACCEPTANCE CHECKS PASSED WITH 0 ERRORS!');
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error('E2E Verification Failed:', err);
  process.exit(1);
});
