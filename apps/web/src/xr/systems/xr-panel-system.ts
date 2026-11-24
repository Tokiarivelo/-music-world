/**
 * Spatial control panel of the XR mode (07-xr-mode requirement 4): a UIKitML `PanelUI` floating above the front edge
 * of the plate, child of the diorama anchor (it follows recentering), shown only during an immersive session.
 *
 * IWSDK 1.1.0 API checked against the installed typings and sources: `PanelUI { config }` (the `.uikitml` file is
 * fetched and parsed at runtime by `PanelUISystem.loadPanel`), `PanelDocument { document: UIKitDocument }` added once
 * loaded, `UIKitDocument.getElementById / setTargetDimensions`, `RayInteractable`, `PokeInteractable`, `Hovered`
 * tags, `world.createTransformEntity(object, { parent })`, `world.exitXR()`. UIKit components: `setProperties`,
 * `addEventListener('click')`; a `<span>`'s `text` property overrides its text child (uikitml `instantiate`).
 */
import {
  createSystem,
  PanelDocument,
  PanelUI,
  PokeInteractable,
  RayInteractable,
  type Entity,
  type UIKitDocument,
  type World,
} from '@iwsdk/core';
import { MathUtils } from 'three';
import {
  VR_PANEL_OFFSET,
  VR_PANEL_SEEK_STEP_SEC,
  VR_PANEL_SIZE_M,
  VR_PANEL_TEMPLATE_SLOTS,
  VR_PANEL_TILT_DEG,
  VR_PANEL_URL,
} from '../constants';
import { panelTime, progressPercent } from '../panel-format';
import { ClockComponent, type WorldClock } from './world-systems';
import { isImmersive, XRRigComponent, type WorldControls, type XRRig } from './xr-systems';

/** Minimal surface of a UIKit component used here. */
interface UIElement {
  setProperties(properties: Record<string, unknown>): void;
  addEventListener(type: 'click', listener: () => void): void;
}

/** What the panel shows last; elements are updated only when a value changes. */
interface PanelView {
  title: UIElement;
  time: UIElement;
  progress: UIElement;
  play: UIElement;
  templates: UIElement[];
  shown: {
    second: number;
    duration: number;
    percent: number;
    playing: boolean | null;
    controls: WorldControls | null;
  };
}

export interface PanelBinding {
  /** The panel entity. */
  readonly entity: Entity;
  /** The diorama anchor entity: carries the rig and the `ClockComponent` (clock of the current scene). */
  readonly anchorEntity: Entity;
  readonly rig: XRRig;
}

/** Updates the panel from the rig controls and the clock; binds the buttons once the document is loaded. */
export class XRPanelSystem extends createSystem({
  rigs: { required: [XRRigComponent] },
  panels: { required: [PanelUI, PanelDocument] },
}) {
  private view: PanelView | null = null;
  private binding: PanelBinding | null = null;

  /** Called by `installXRPanel` with the rig and a clock getter. */
  bind(binding: PanelBinding): void {
    this.binding = binding;
  }

  init(): void {
    this.queries.panels.subscribe('qualify', (entity) => {
      if (entity !== this.binding?.entity) return;
      const document = entity.getValue(PanelDocument, 'document') as UIKitDocument | undefined;
      if (document) this.view = this.bindDocument(document);
    });
  }

  private bindDocument(document: UIKitDocument): PanelView {
    document.setTargetDimensions(VR_PANEL_SIZE_M.width, VR_PANEL_SIZE_M.height);
    const el = (id: string) => document.requireElementById(id) as unknown as UIElement;
    const controls = () => this.binding?.rig.controls ?? null;
    el('mw-play').addEventListener('click', () => controls()?.toggle());
    el('mw-restart').addEventListener('click', () => controls()?.seek(0));
    el('mw-back').addEventListener('click', () => controls()?.seekBy(-VR_PANEL_SEEK_STEP_SEC));
    el('mw-forward').addEventListener('click', () => controls()?.seekBy(VR_PANEL_SEEK_STEP_SEC));
    el('mw-recenter').addEventListener('click', () => {
      if (this.binding) this.binding.rig.recenterRequested = true;
    });
    el('mw-exit').addEventListener('click', () => this.world.exitXR());
    const templates: UIElement[] = [];
    for (let i = 0; i < VR_PANEL_TEMPLATE_SLOTS; i++) {
      const button = el(`mw-tpl-${i}`);
      button.addEventListener('click', () => {
        const c = controls();
        const choice = c?.templates[i];
        if (c && choice && choice.id !== c.templateId) c.selectTemplate(choice.id);
      });
      templates.push(button);
    }
    return {
      title: el('mw-title'),
      time: el('mw-time'),
      progress: el('mw-progress'),
      play: el('mw-play'),
      templates,
      shown: { second: -1, duration: -1, percent: -1, playing: null, controls: null },
    };
  }

  update(): void {
    const binding = this.binding;
    const object = binding?.entity.object3D;
    if (!binding || !object) return;
    const immersive = isImmersive(this.world);
    if (object.visible !== immersive) object.visible = immersive;
    const view = this.view;
    const controls = binding.rig.controls;
    if (!immersive || !view || !controls) return;

    const shown = view.shown;
    const clock = binding.anchorEntity.getValue(ClockComponent, 'clock') as WorldClock | null;
    const now = clock?.now() ?? 0; // the audio clock: the only time source
    const duration = controls.duration();
    // Text is rebuilt only when the displayed second changes (no per-frame string allocation).
    const second = Math.floor(now);
    if (second !== shown.second || duration !== shown.duration) {
      shown.second = second;
      shown.duration = duration;
      view.time.setProperties({ text: panelTime(now, duration) });
    }
    const percent = progressPercent(now, duration);
    if (percent !== shown.percent) {
      shown.percent = percent;
      view.progress.setProperties({ width: `${percent}%` });
    }
    const playing = controls.isPlaying();
    if (playing !== shown.playing) {
      shown.playing = playing;
      view.play.setProperties({ text: playing ? 'Pause' : 'Play' });
    }
    // Title and template choices change only with a new controls object (React memo).
    if (controls !== shown.controls) {
      shown.controls = controls;
      view.title.setProperties({ text: controls.title });
      view.templates.forEach((button, i) => {
        const choice = controls.templates[i];
        button.setProperties(
          choice
            ? { display: 'flex', text: choice.name, borderWidth: choice.id === controls.templateId ? 0.2 : 0 }
            : { display: 'none' },
        );
      });
    }
  }
}

/** Creates the panel entity under the diorama anchor and registers its system. */
export function installXRPanel(world: World, anchorEntity: Entity, rig: XRRig): PanelBinding {
  const entity = world.createTransformEntity(undefined, { parent: anchorEntity });
  const object = entity.object3D!;
  object.name = 'music-world-panel';
  object.position.set(VR_PANEL_OFFSET.x, VR_PANEL_OFFSET.y, VR_PANEL_OFFSET.z);
  object.rotation.set(-MathUtils.degToRad(VR_PANEL_TILT_DEG), 0, 0);
  object.visible = false;
  entity.addComponent(PanelUI, { config: VR_PANEL_URL });
  entity.addComponent(RayInteractable);
  entity.addComponent(PokeInteractable);
  rig.panel = entity;
  const binding: PanelBinding = { entity, anchorEntity, rig };
  world.registerSystem(XRPanelSystem);
  world.getSystem(XRPanelSystem)?.bind(binding);
  return binding;
}
