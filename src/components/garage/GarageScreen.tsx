import { useMemo, useState } from 'react';
import { useGameStore } from '../../state/gameStore';
import {
  VEHICLE_CATALOG,
  getDefaultCustomizationForVehicle,
  getVehicleSpec,
} from '../../game/vehicles/CarConfigs';
import {
  BODY_KIT_OPTIONS,
  DECAL_OPTIONS,
  PAINT_OPTIONS,
  SPOILER_OPTIONS,
  WHEEL_OPTIONS,
  getCosmeticKey,
  type CosmeticCategory,
} from '../../game/vehicles/CustomizationData';
import type { UpgradeCategory } from '../../game/core/types';
import {
  MAX_UPGRADE_LEVEL,
  UPGRADE_CATALOG,
  applyUpgradesAndCustomization,
  computeVehicleRatings,
  createDefaultUpgradeLevels,
  getNextUpgradeCost,
} from '../../systems/progression/UpgradeSystem';
import { formatCredits } from '../../systems/progression/EconomySystem';

interface PendingPurchase {
  title: string;
  subtitle: string;
  price: number;
  kind: 'vehicle' | 'cosmetic' | 'upgrade' | 'reset';
  vehicleId: string;
  cosmeticCategory?: CosmeticCategory;
  cosmeticId?: string;
  upgradeCategory?: UpgradeCategory;
}

const GARAGE_TABS = [
  { id: 'home', label: 'OVERVIEW' },
  { id: 'vehicles', label: 'VEHICLES' },
  { id: 'customize', label: 'CUSTOMIZE' },
  { id: 'upgrades', label: 'UPGRADES' },
] as const;

export function GarageScreen() {
  const appScreen = useGameStore((s) => s.appScreen);
  const garageTab = useGameStore((s) => s.garageTab);
  const previewVehicleId = useGameStore((s) => s.garagePreviewVehicleId);
  const autoRotate = useGameStore((s) => s.garageAutoRotate);
  const credits = useGameStore((s) => s.credits);
  const ownedVehicleIds = useGameStore((s) => s.ownedVehicleIds);
  const selectedVehicleId = useGameStore((s) => s.selectedVehicleId);
  const ownedCosmeticKeys = useGameStore((s) => s.ownedCosmeticKeys);
  const vehicleUpgrades = useGameStore((s) => s.vehicleUpgrades);
  const vehicleCustomizations = useGameStore((s) => s.vehicleCustomizations);

  const closeGarage = useGameStore((s) => s.closeGarage);
  const setGarageTab = useGameStore((s) => s.setGarageTab);
  const setGaragePreviewVehicle = useGameStore((s) => s.setGaragePreviewVehicle);
  const toggleGarageAutoRotate = useGameStore((s) => s.toggleGarageAutoRotate);
  const selectVehicle = useGameStore((s) => s.selectVehicle);
  const purchaseVehicle = useGameStore((s) => s.purchaseVehicle);
  const equipOrPurchaseCosmetic = useGameStore((s) => s.equipOrPurchaseCosmetic);
  const purchaseUpgrade = useGameStore((s) => s.purchaseUpgrade);
  const resetSaveProgress = useGameStore((s) => s.resetSaveProgress);

  const [pendingPurchase, setPendingPurchase] = useState<PendingPurchase | null>(
    null
  );
  const [feedback, setFeedback] = useState<{
    tone: 'ok' | 'error';
    text: string;
  } | null>(null);

  const basePreviewSpec = useMemo(
    () => getVehicleSpec(previewVehicleId),
    [previewVehicleId]
  );
  const previewUpgrades =
    vehicleUpgrades[basePreviewSpec.id] ?? createDefaultUpgradeLevels();
  const previewCustomization =
    vehicleCustomizations[basePreviewSpec.id] ??
    getDefaultCustomizationForVehicle(basePreviewSpec);

  const activePreviewSpec = useMemo(
    () =>
      applyUpgradesAndCustomization(
        basePreviewSpec,
        previewUpgrades,
        previewCustomization
      ),
    [basePreviewSpec, previewUpgrades, previewCustomization]
  );

  const ratings = useMemo(
    () => computeVehicleRatings(activePreviewSpec),
    [activePreviewSpec]
  );

  if (appScreen !== 'garage') return null;

  const isPreviewOwned = ownedVehicleIds.includes(basePreviewSpec.id);
  const isPreviewSelected = selectedVehicleId === basePreviewSpec.id;
  const totalUpgradeStages = Object.values(previewUpgrades).reduce(
    (sum, lvl) => sum + lvl,
    0
  );
  const maxPossibleStages = UPGRADE_CATALOG.length * MAX_UPGRADE_LEVEL;

  const showFeedback = (tone: 'ok' | 'error', text: string) => {
    setFeedback({ tone, text });
  };

  const handleRequestVehiclePurchase = (carId: string, name: string, price: number) => {
    if (ownedVehicleIds.includes(carId)) {
      selectVehicle(carId);
      showFeedback('ok', `${name} selected for racing.`);
      return;
    }
    if (credits < price) {
      showFeedback(
        'error',
        `Insufficient credits for ${name} (${formatCredits(price)} required).`
      );
      return;
    }
    setPendingPurchase({
      title: `Purchase ${name}`,
      subtitle: 'Unlocks vehicle permanently for all races and customization.',
      price,
      kind: 'vehicle',
      vehicleId: carId,
    });
  };

  const handleCosmeticClick = (
    category: CosmeticCategory,
    itemId: string,
    label: string,
    price: number
  ) => {
    if (!isPreviewOwned) {
      showFeedback('error', `Purchase ${basePreviewSpec.name} before customizing it.`);
      return;
    }
    const key = getCosmeticKey(category, itemId);
    const alreadyOwned = price <= 0 || ownedCosmeticKeys.includes(key);
    if (alreadyOwned) {
      const res = equipOrPurchaseCosmetic(basePreviewSpec.id, category, itemId, 0);
      if (res.ok) {
        showFeedback('ok', `Equipped ${label}.`);
      } else if (res.reason) {
        showFeedback('error', res.reason);
      }
      return;
    }
    if (credits < price) {
      showFeedback(
        'error',
        `Insufficient credits for ${label} (${formatCredits(price)} required).`
      );
      return;
    }
    setPendingPurchase({
      title: `Purchase ${label}`,
      subtitle: `Visual ${category} part for ${basePreviewSpec.name}.`,
      price,
      kind: 'cosmetic',
      vehicleId: basePreviewSpec.id,
      cosmeticCategory: category,
      cosmeticId: itemId,
    });
  };

  const handleUpgradeClick = (category: UpgradeCategory, name: string) => {
    if (!isPreviewOwned) {
      showFeedback('error', `Purchase ${basePreviewSpec.name} before upgrading it.`);
      return;
    }
    const currentLevel = previewUpgrades[category] ?? 0;
    const cost = getNextUpgradeCost(category, currentLevel);
    if (cost === null) {
      showFeedback('error', `${name} is already at maximum Stage ${MAX_UPGRADE_LEVEL}.`);
      return;
    }
    if (credits < cost) {
      showFeedback(
        'error',
        `Insufficient credits for ${name} Stage ${currentLevel + 1} (${formatCredits(cost)} required).`
      );
      return;
    }
    setPendingPurchase({
      title: `${name} — Stage ${currentLevel + 1}`,
      subtitle: `Performance upgrade installed on ${basePreviewSpec.name}.`,
      price: cost,
      kind: 'upgrade',
      vehicleId: basePreviewSpec.id,
      upgradeCategory: category,
    });
  };

  const handleConfirmModal = () => {
    if (!pendingPurchase) return;
    const item = pendingPurchase;
    setPendingPurchase(null);

    if (item.kind === 'vehicle') {
      const res = purchaseVehicle(item.vehicleId);
      if (res.ok) {
        showFeedback('ok', `${item.title.replace('Purchase ', '')} purchased and selected!`);
      } else {
        showFeedback('error', res.reason ?? 'Vehicle purchase failed.');
      }
      return;
    }

    if (
      item.kind === 'cosmetic' &&
      item.cosmeticCategory &&
      item.cosmeticId
    ) {
      const res = equipOrPurchaseCosmetic(
        item.vehicleId,
        item.cosmeticCategory,
        item.cosmeticId,
        item.price
      );
      if (res.ok) {
        showFeedback('ok', `${item.title.replace('Purchase ', '')} installed!`);
      } else {
        showFeedback('error', res.reason ?? 'Customization purchase failed.');
      }
      return;
    }

    if (item.kind === 'upgrade' && item.upgradeCategory) {
      const res = purchaseUpgrade(item.vehicleId, item.upgradeCategory);
      if (res.ok) {
        showFeedback('ok', `${item.title} installed!`);
      } else {
        showFeedback('error', res.reason ?? 'Upgrade purchase failed.');
      }
      return;
    }

    if (item.kind === 'reset') {
      resetSaveProgress();
      showFeedback('ok', 'Garage profile reset to starter defaults.');
    }
  };

  const selectedCarName = getVehicleSpec(selectedVehicleId).name;

  return (
    <div className="pv-garage-root" data-testid="garage-screen">
      {/* Top Header */}
      <header className="pv-garage-topbar">
        <div className="pv-garage-brand">
          <button
            type="button"
            className="pv-btn pv-garage-back-btn"
            data-testid="btn-garage-back"
            onClick={() => closeGarage()}
          >
            ← RACE MENU
          </button>
          <div>
            <div className="pv-pause-eyebrow">PROJECT VELOCITY // SHOWROOM</div>
            <h1 className="pv-garage-title">PERFORMANCE GARAGE</h1>
          </div>
        </div>

        <nav className="pv-garage-tabs" aria-label="Garage sections">
          {GARAGE_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`pv-garage-tab ${garageTab === tab.id ? 'active' : ''}`}
              data-testid={`garage-tab-${tab.id}`}
              onClick={() => {
                setFeedback(null);
                setGarageTab(tab.id);
              }}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="pv-garage-status-right">
          <button
            type="button"
            className={`pv-btn pv-garage-orbit-btn ${autoRotate ? 'is-on' : ''}`}
            data-testid="btn-garage-autorotate"
            onClick={() => toggleGarageAutoRotate()}
          >
            {autoRotate ? 'TURNTABLE: ON' : 'TURNTABLE: OFF'}
          </button>
          <div className="pv-credits-pill" data-testid="garage-credits">
            <span className="pv-label">CREDITS</span>
            <span className="pv-credits-val">{formatCredits(credits)}</span>
          </div>
        </div>
      </header>

      {/* Center Drag Hint */}
      <div className="pv-garage-orbit-hint">
        DRAG TO ORBIT · SCROLL TO ZOOM · SHOWROOM PREVIEW
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`pv-garage-toast ${feedback.tone === 'error' ? 'is-error' : 'is-ok'}`}
          role="status"
          data-testid="garage-feedback"
        >
          <span>{feedback.text}</span>
          <button
            type="button"
            className="pv-toast-close"
            aria-label="Dismiss message"
            onClick={() => setFeedback(null)}
          >
            ✕
          </button>
        </div>
      )}

      {/* Left Interactive Drawer */}
      <aside className="pv-garage-panel" aria-label="Garage controls">
        {garageTab === 'home' && (
          <div className="pv-garage-section-stack" data-testid="garage-home-panel">
            <div>
              <span className="pv-label">ACTIVE RACE ENTRY</span>
              <h2 className="pv-garage-heading">{selectedCarName}</h2>
              <p className="pv-garage-subcopy">
                Customize bodywork, equip performance stages, or unlock faster chassis
                using credits earned on track.
              </p>
            </div>

            <div className="pv-home-summary-grid">
              <div className="pv-stat-box">
                <span className="pv-label">OWNED CARS</span>
                <span className="pv-stat-val">
                  {ownedVehicleIds.length} / {VEHICLE_CATALOG.length}
                </span>
              </div>
              <div className="pv-stat-box">
                <span className="pv-label">PREVIEW UPGRADES</span>
                <span className="pv-stat-val">
                  {totalUpgradeStages} / {maxPossibleStages} STG
                </span>
              </div>
            </div>

            <div className="pv-home-actions">
              <button
                type="button"
                className="pv-btn"
                onClick={() => setGarageTab('vehicles')}
              >
                Browse Dealership ({VEHICLE_CATALOG.length} Cars)
              </button>
              <button
                type="button"
                className="pv-btn"
                onClick={() => setGarageTab('customize')}
              >
                Visual Paint, Wheels &amp; Aero
              </button>
              <button
                type="button"
                className="pv-btn"
                onClick={() => setGarageTab('upgrades')}
              >
                Tune Engine, Tires &amp; Chassis
              </button>
              <button
                type="button"
                className="pv-btn pv-btn-primary"
                onClick={() => closeGarage()}
              >
                Return to Race Setup
              </button>
            </div>

            <div className="pv-garage-footer-util">
              <button
                type="button"
                className="pv-link-danger"
                data-testid="btn-reset-save"
                onClick={() =>
                  setPendingPurchase({
                    title: 'Reset Career & Garage Progress',
                    subtitle:
                      'Restores starter credits (2,000 CR) and starter Veloce GT-R Concept.',
                    price: 0,
                    kind: 'reset',
                    vehicleId: basePreviewSpec.id,
                  })
                }
              >
                Reset Saved Progress
              </button>
            </div>
          </div>
        )}

        {garageTab === 'vehicles' && (
          <div className="pv-garage-section-stack" data-testid="garage-vehicles-panel">
            <div>
              <span className="pv-label">DEALERSHIP ROSTER</span>
              <h2 className="pv-garage-heading">SELECT OR UNLOCK VEHICLE</h2>
            </div>

            <div className="pv-vehicle-list">
              {VEHICLE_CATALOG.map((car) => {
                const carPrice = car.price ?? 0;
                const owned = ownedVehicleIds.includes(car.id);
                const selected = selectedVehicleId === car.id;
                const previewing = basePreviewSpec.id === car.id;
                const affordable = credits >= carPrice;
                const carRatings = computeVehicleRatings(car);
                const avgGrip =
                  (car.tires.frontLateralGrip + car.tires.rearLateralGrip) * 0.5;

                return (
                  <div
                    key={car.id}
                    className={`pv-vehicle-card ${previewing ? 'previewing' : ''} ${
                      selected ? 'selected' : ''
                    }`}
                    data-testid={`vehicle-card-${car.id}`}
                    onClick={() => setGaragePreviewVehicle(car.id)}
                  >
                    <div className="pv-vehicle-card-top">
                      <div>
                        <div className="pv-vehicle-name">{car.name}</div>
                        <div className="pv-vehicle-tagline">{car.tagline ?? car.category}</div>
                      </div>
                      <span
                        className={`pv-badge ${
                          selected ? 'badge-selected' : owned ? 'badge-owned' : 'badge-locked'
                        }`}
                      >
                        {selected ? 'SELECTED' : owned ? 'OWNED' : formatCredits(carPrice)}
                      </span>
                    </div>

                    <div className="pv-vehicle-mini-specs">
                      <span>TOP {carRatings.topSpeedKmh} km/h</span>
                      <span>MASS {car.massKg} kg</span>
                      <span>GRIP {avgGrip.toFixed(2)}</span>
                    </div>

                    <div className="pv-vehicle-card-actions">
                      {selected ? (
                        <button
                          type="button"
                          className="pv-btn pv-btn-sm"
                          disabled
                          data-testid={`btn-selected-vehicle-${car.id}`}
                        >
                          ACTIVE RACE CAR
                        </button>
                      ) : owned ? (
                        <button
                          type="button"
                          className="pv-btn pv-btn-sm pv-btn-primary"
                          data-testid={`btn-select-vehicle-${car.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setGaragePreviewVehicle(car.id);
                            selectVehicle(car.id);
                            showFeedback('ok', `${car.name} equipped for next race.`);
                          }}
                        >
                          SELECT FOR RACE
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={`pv-btn pv-btn-sm ${
                            affordable ? 'pv-btn-primary' : 'pv-btn-locked'
                          }`}
                          data-testid={`btn-buy-vehicle-${car.id}`}
                          data-affordable={String(affordable)}
                          onClick={(e) => {
                            e.stopPropagation();
                            setGaragePreviewVehicle(car.id);
                            handleRequestVehiclePurchase(car.id, car.name, carPrice);
                          }}
                        >
                          {affordable
                            ? `BUY · ${formatCredits(carPrice)}`
                            : `LOCKED · ${formatCredits(carPrice)}`}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {garageTab === 'customize' && (
          <div className="pv-garage-section-stack" data-testid="garage-customize-panel">
            <div className="pv-garage-panel-title-row">
              <div>
                <span className="pv-label">VISUAL STUDIO // {basePreviewSpec.name}</span>
                <h2 className="pv-garage-heading">EXTERIOR CUSTOMIZATION</h2>
              </div>
            </div>

            {!isPreviewOwned && (
              <div className="pv-locked-notice">
                <span>You are previewing a locked car.</span>
                <button
                  type="button"
                  className="pv-btn pv-btn-sm"
                  onClick={() => setGaragePreviewVehicle(selectedVehicleId)}
                >
                  Switch to {selectedCarName}
                </button>
              </div>
            )}

            {/* Paint Colors */}
            <div className="pv-custom-group">
              <span className="pv-label">BODY PAINT</span>
              <div className="pv-swatch-grid">
                {PAINT_OPTIONS.map((opt) => {
                  const key = getCosmeticKey('paint', opt.id);
                  const owned = opt.price === 0 || ownedCosmeticKeys.includes(key);
                  const active = previewCustomization.paintId === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      className={`pv-swatch-btn ${active ? 'active' : ''}`}
                      data-testid={`cosmetic-paint-${opt.id}`}
                      title={`${opt.name} (${owned ? 'Owned' : formatCredits(opt.price)})`}
                      onClick={() =>
                        handleCosmeticClick('paint', opt.id, opt.name, opt.price)
                      }
                    >
                      <span
                        className="pv-swatch-dot"
                        style={{ backgroundColor: opt.hex }}
                      />
                      <span className="pv-swatch-label">{opt.name}</span>
                      <span className="pv-swatch-price">
                        {active ? 'ACTIVE' : owned ? 'OWNED' : formatCredits(opt.price)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Wheels */}
            <div className="pv-custom-group">
              <span className="pv-label">WHEELS &amp; RIMS</span>
              <div className="pv-option-grid">
                {WHEEL_OPTIONS.map((opt) => {
                  const key = getCosmeticKey('wheel', opt.id);
                  const owned = opt.price === 0 || ownedCosmeticKeys.includes(key);
                  const active = previewCustomization.wheelId === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      className={`pv-option-pill ${active ? 'active' : ''}`}
                      data-testid={`cosmetic-wheels-${opt.id}`}
                      onClick={() =>
                        handleCosmeticClick('wheel', opt.id, opt.name, opt.price)
                      }
                    >
                      <span>{opt.name}</span>
                      <span className="pv-pill-cost">
                        {active ? 'ACTIVE' : owned ? 'OWNED' : formatCredits(opt.price)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Spoilers */}
            <div className="pv-custom-group">
              <span className="pv-label">REAR SPOILER</span>
              <div className="pv-option-grid">
                {SPOILER_OPTIONS.map((opt) => {
                  const key = getCosmeticKey('spoiler', opt.id);
                  const owned = opt.price === 0 || ownedCosmeticKeys.includes(key);
                  const active = previewCustomization.spoilerId === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      className={`pv-option-pill ${active ? 'active' : ''}`}
                      data-testid={`cosmetic-spoiler-${opt.id}`}
                      onClick={() =>
                        handleCosmeticClick('spoiler', opt.id, opt.name, opt.price)
                      }
                    >
                      <span>{opt.name}</span>
                      <span className="pv-pill-cost">
                        {active ? 'ACTIVE' : owned ? 'OWNED' : formatCredits(opt.price)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Body Kits */}
            <div className="pv-custom-group">
              <span className="pv-label">BODY KIT</span>
              <div className="pv-option-grid">
                {BODY_KIT_OPTIONS.map((opt) => {
                  const key = getCosmeticKey('bodyKit', opt.id);
                  const owned = opt.price === 0 || ownedCosmeticKeys.includes(key);
                  const active = previewCustomization.bodyKitId === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      className={`pv-option-pill ${active ? 'active' : ''}`}
                      data-testid={`cosmetic-bodyKit-${opt.id}`}
                      onClick={() =>
                        handleCosmeticClick('bodyKit', opt.id, opt.name, opt.price)
                      }
                    >
                      <span>{opt.name}</span>
                      <span className="pv-pill-cost">
                        {active ? 'ACTIVE' : owned ? 'OWNED' : formatCredits(opt.price)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Decals */}
            <div className="pv-custom-group">
              <span className="pv-label">RACING DECALS</span>
              <div className="pv-option-grid">
                {DECAL_OPTIONS.map((opt) => {
                  const key = getCosmeticKey('decal', opt.id);
                  const owned = opt.price === 0 || ownedCosmeticKeys.includes(key);
                  const active = previewCustomization.decalId === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      className={`pv-option-pill ${active ? 'active' : ''}`}
                      data-testid={`cosmetic-decal-${opt.id}`}
                      onClick={() =>
                        handleCosmeticClick('decal', opt.id, opt.name, opt.price)
                      }
                    >
                      <span>{opt.name}</span>
                      <span className="pv-pill-cost">
                        {active ? 'ACTIVE' : owned ? 'OWNED' : formatCredits(opt.price)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {garageTab === 'upgrades' && (
          <div className="pv-garage-section-stack" data-testid="garage-upgrades-panel">
            <div>
              <span className="pv-label">TUNING BAY // {basePreviewSpec.name}</span>
              <h2 className="pv-garage-heading">PERFORMANCE UPGRADES</h2>
            </div>

            {!isPreviewOwned && (
              <div className="pv-locked-notice">
                <span>Purchase this vehicle to install performance stages.</span>
                <button
                  type="button"
                  className="pv-btn pv-btn-sm"
                  onClick={() => setGaragePreviewVehicle(selectedVehicleId)}
                >
                  Switch to {selectedCarName}
                </button>
              </div>
            )}

            <div className="pv-upgrade-list">
              {UPGRADE_CATALOG.map((cat) => {
                const currentLevel = previewUpgrades[cat.id] ?? 0;
                const nextCost = getNextUpgradeCost(cat.id, currentLevel);
                const isMaxed = nextCost === null;
                const affordable = nextCost !== null && credits >= nextCost;

                return (
                  <div
                    key={cat.id}
                    className="pv-upgrade-card"
                    data-testid={`upgrade-card-${cat.id}`}
                  >
                    <div className="pv-upgrade-head">
                      <div>
                        <div className="pv-upgrade-name">{cat.name}</div>
                        <div className="pv-upgrade-desc">{cat.effectSummary}</div>
                      </div>
                      <span
                        className="pv-stage-tag"
                        data-testid={`upgrade-level-${cat.id}`}
                      >
                        STG {currentLevel}/{MAX_UPGRADE_LEVEL}
                      </span>
                    </div>

                    <div className="pv-stage-pips" aria-hidden="true">
                      {[1, 2, 3].map((pip) => (
                        <span
                          key={pip}
                          className={`pv-stage-pip ${
                            currentLevel >= pip ? 'filled' : ''
                          }`}
                        />
                      ))}
                    </div>

                    <button
                      type="button"
                      className={`pv-btn pv-btn-sm ${
                        isMaxed
                          ? ''
                          : isPreviewOwned && affordable
                            ? 'pv-btn-primary'
                            : 'pv-btn-locked'
                      }`}
                      disabled={isMaxed}
                      data-testid={`btn-upgrade-${cat.id}`}
                      onClick={() => handleUpgradeClick(cat.id, cat.name)}
                    >
                      {isMaxed
                        ? 'MAX STAGE INSTALLED'
                        : `INSTALL STG ${currentLevel + 1} · ${formatCredits(nextCost)}`}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </aside>

      {/* Right Telemetry / Vehicle Spec Card */}
      <aside className="pv-garage-specs-panel" aria-label="Vehicle specifications">
        <div className="pv-specs-header">
          <div>
            <span className="pv-label">CHASSIS SPECIFICATION</span>
            <h3 className="pv-specs-title" data-testid="garage-preview-name">
              {activePreviewSpec.name}
            </h3>
          </div>
          <span
            className={`pv-badge ${
              isPreviewSelected
                ? 'badge-selected'
                : isPreviewOwned
                  ? 'badge-owned'
                  : 'badge-locked'
            }`}
          >
            {isPreviewSelected ? 'EQUIPPED' : isPreviewOwned ? 'IN GARAGE' : 'LOCKED'}
          </span>
        </div>

        <p className="pv-specs-tagline">{activePreviewSpec.tagline}</p>

        <div className="pv-rating-bars">
          {[
            {
              label: 'TOP SPEED',
              value: ratings.topSpeed,
              display: `${ratings.topSpeedKmh} km/h`,
              testId: 'spec-top-speed',
            },
            {
              label: 'ACCELERATION',
              value: ratings.acceleration,
              display: `${Math.round(activePreviewSpec.drivetrain.maxDriveForce)} N`,
              testId: 'spec-acceleration',
            },
            {
              label: 'HANDLING',
              value: ratings.handling,
              display: `${((activePreviewSpec.tires.frontLateralGrip + activePreviewSpec.tires.rearLateralGrip) * 0.5).toFixed(2)} G`,
              testId: 'spec-handling',
            },
            {
              label: 'BRAKING',
              value: ratings.braking,
              display: `${Math.round(activePreviewSpec.drivetrain.maxBrakeForce)} N`,
              testId: 'spec-braking',
            },
          ].map((stat) => (
            <div key={stat.label} className="pv-rating-row">
              <div className="pv-rating-label-row">
                <span className="pv-label">{stat.label}</span>
                <span className="pv-mono-val" data-testid={stat.testId}>
                  {stat.display}
                </span>
              </div>
              <div className="pv-rating-track">
                <div
                  className="pv-rating-fill"
                  style={{ width: `${stat.value}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="pv-specs-meta">
          <div>
            <span className="pv-label">CURB MASS</span>
            <span className="pv-mono-val">{activePreviewSpec.massKg} kg</span>
          </div>
          <div>
            <span className="pv-label">AERO KIT</span>
            <span className="pv-mono-val">
              {(
                activePreviewSpec.appearance?.bodyKitStyle ??
                previewCustomization.bodyKitId
              ).toUpperCase()}
            </span>
          </div>
          <div>
            <span className="pv-label">SPOILER</span>
            <span className="pv-mono-val">
              {(
                activePreviewSpec.appearance?.spoilerStyle ??
                previewCustomization.spoilerId
              ).toUpperCase()}
            </span>
          </div>
        </div>

        {!isPreviewOwned ? (
          <button
            type="button"
            className={`pv-btn pv-btn-primary pv-specs-cta ${
              credits < (basePreviewSpec.price ?? 0) ? 'pv-btn-locked' : ''
            }`}
            onClick={() =>
              handleRequestVehiclePurchase(
                basePreviewSpec.id,
                basePreviewSpec.name,
                basePreviewSpec.price ?? 0
              )
            }
          >
            {credits >= (basePreviewSpec.price ?? 0)
              ? `PURCHASE CAR · ${formatCredits(basePreviewSpec.price ?? 0)}`
              : `NEED ${formatCredits(basePreviewSpec.price ?? 0)}`}
          </button>
        ) : !isPreviewSelected ? (
          <button
            type="button"
            className="pv-btn pv-btn-primary pv-specs-cta"
            onClick={() => {
              selectVehicle(basePreviewSpec.id);
              showFeedback('ok', `${basePreviewSpec.name} selected for racing.`);
            }}
          >
            SELECT FOR RACE
          </button>
        ) : (
          <button
            type="button"
            className="pv-btn pv-btn-primary pv-specs-cta"
            onClick={() => closeGarage()}
          >
            READY TO RACE →
          </button>
        )}
      </aside>

      {/* Purchase Confirmation Modal */}
      {pendingPurchase && (
        <div
          className="pv-pause-backdrop pv-confirm-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Purchase confirmation"
          data-testid="purchase-confirm-modal"
        >
          <div className="pv-pause-card pv-confirm-card">
            <div className="pv-pause-eyebrow">
              {pendingPurchase.kind === 'reset'
                ? 'PROFILE MANAGEMENT'
                : 'CONFIRM TRANSACTION'}
            </div>
            <h2 className="pv-pause-title">{pendingPurchase.title}</h2>
            <p className="pv-confirm-sub">{pendingPurchase.subtitle}</p>

            {pendingPurchase.kind !== 'reset' && (
              <div className="pv-confirm-ledger">
                <div>
                  <span className="pv-label">ITEM COST</span>
                  <span className="pv-mono-val">
                    {formatCredits(pendingPurchase.price)}
                  </span>
                </div>
                <div>
                  <span className="pv-label">CURRENT BALANCE</span>
                  <span className="pv-mono-val">{formatCredits(credits)}</span>
                </div>
                <div>
                  <span className="pv-label">BALANCE AFTER</span>
                  <span className="pv-mono-val pv-best-lap">
                    {formatCredits(credits - pendingPurchase.price)}
                  </span>
                </div>
              </div>
            )}

            <div className="pv-results-actions">
              <button
                type="button"
                className="pv-btn pv-btn-primary"
                data-testid="btn-confirm-purchase"
                onClick={handleConfirmModal}
              >
                {pendingPurchase.kind === 'reset' ? 'Confirm Reset' : 'Confirm Purchase'}
              </button>
              <button
                type="button"
                className="pv-btn"
                data-testid="btn-cancel-purchase"
                onClick={() => setPendingPurchase(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
