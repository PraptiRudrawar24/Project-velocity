export interface DrivingInputState {
  accelerate: boolean;
  brakeReverse: boolean;
  steerLeft: boolean;
  steerRight: boolean;
  handbrake: boolean;
  /** Optional continuous axes (-1..1 steer, 0..1 throttle/brake) used by AI drivers */
  steerAxis?: number;
  throttleAxis?: number;
  brakeAxis?: number;
}

export interface InputActionCallbacks {
  onCycleCamera?: () => void;
  onResetVehicle?: () => void;
  onTogglePause?: () => void;
  onToggleControls?: () => void;
  onToggleMute?: () => void;
}

const PREVENT_SCROLL_CODES = new Set<string>([
  'Space',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
]);

const GAMEPLAY_CODES = new Set<string>([
  'KeyW',
  'KeyS',
  'KeyA',
  'KeyD',
  'Space',
  'KeyC',
  'KeyR',
  'KeyH',
  'KeyM',
  'Escape',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
]);

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable
  );
}

export class InputManager {
  private heldCodes = new Set<string>();
  private callbacks: InputActionCallbacks;
  private subscribers = new Set<(state: DrivingInputState) => void>();
  private attached = false;

  private readonly state: DrivingInputState = {
    accelerate: false,
    brakeReverse: false,
    steerLeft: false,
    steerRight: false,
    handbrake: false,
  };

  constructor(callbacks: InputActionCallbacks = {}) {
    this.callbacks = callbacks;
  }

  public setCallbacks(callbacks: InputActionCallbacks): void {
    this.callbacks = callbacks;
  }

  public attach(): void {
    if (this.attached || typeof window === 'undefined') return;
    window.addEventListener('keydown', this.handleKeyDown, {
      capture: true,
      passive: false,
    });
    window.addEventListener('keyup', this.handleKeyUp, { capture: true });
    window.addEventListener('blur', this.handleWindowBlur);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    this.attached = true;
  }

  public detach(): void {
    if (!this.attached || typeof window === 'undefined') return;
    window.removeEventListener('keydown', this.handleKeyDown, {
      capture: true,
    });
    window.removeEventListener('keyup', this.handleKeyUp, { capture: true });
    window.removeEventListener('blur', this.handleWindowBlur);
    document.removeEventListener(
      'visibilitychange',
      this.handleVisibilityChange
    );
    this.clearAllKeys();
    this.attached = false;
  }

  public getInputState(): Readonly<DrivingInputState> {
    return this.state;
  }

  public subscribe(listener: (state: DrivingInputState) => void): () => void {
    this.subscribers.add(listener);
    listener({ ...this.state });
    return () => {
      this.subscribers.delete(listener);
    };
  }

  /** Programmatic key injection for deterministic testing */
  public setKeyHeld(code: string, held: boolean): void {
    if (held) {
      this.heldCodes.add(code);
    } else {
      this.heldCodes.delete(code);
    }
    this.syncContinuousState();
  }

  public clearAllKeys(): void {
    if (this.heldCodes.size === 0) return;
    this.heldCodes.clear();
    this.syncContinuousState();
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    if (isEditableTarget(event.target)) return;

    const code = event.code;
    if (!GAMEPLAY_CODES.has(code)) return;

    // Prevent browser scrolling and prevent focused buttons from activating on Space
    if (PREVENT_SCROLL_CODES.has(code)) {
      event.preventDefault();
    }

    if (
      event.target instanceof HTMLButtonElement ||
      event.target instanceof HTMLAnchorElement
    ) {
      event.target.blur();
    }

    if (!event.repeat) {
      if (code === 'KeyC') {
        this.callbacks.onCycleCamera?.();
        return;
      }
      if (code === 'KeyR') {
        this.callbacks.onResetVehicle?.();
        return;
      }
      if (code === 'Escape') {
        event.preventDefault();
        this.callbacks.onTogglePause?.();
        return;
      }
      if (code === 'KeyH') {
        this.callbacks.onToggleControls?.();
        return;
      }
      if (code === 'KeyM') {
        this.callbacks.onToggleMute?.();
        return;
      }
    }

    const prevSize = this.heldCodes.size;
    this.heldCodes.add(code);
    if (this.heldCodes.size !== prevSize) {
      this.syncContinuousState();
    }
  };

  private handleKeyUp = (event: KeyboardEvent): void => {
    const code = event.code;
    if (this.heldCodes.delete(code)) {
      this.syncContinuousState();
    }
  };

  private handleWindowBlur = (): void => {
    this.clearAllKeys();
  };

  private handleVisibilityChange = (): void => {
    if (typeof document !== 'undefined' && document.hidden) {
      this.clearAllKeys();
    }
  };

  private syncContinuousState(): void {
    this.state.accelerate =
      this.heldCodes.has('KeyW') || this.heldCodes.has('ArrowUp');
    this.state.brakeReverse =
      this.heldCodes.has('KeyS') || this.heldCodes.has('ArrowDown');
    this.state.steerLeft =
      this.heldCodes.has('KeyA') || this.heldCodes.has('ArrowLeft');
    this.state.steerRight =
      this.heldCodes.has('KeyD') || this.heldCodes.has('ArrowRight');
    this.state.handbrake = this.heldCodes.has('Space');

    const snapshot = { ...this.state };
    for (const listener of this.subscribers) {
      listener(snapshot);
    }
  }
}

export const sharedInputManager = new InputManager();

