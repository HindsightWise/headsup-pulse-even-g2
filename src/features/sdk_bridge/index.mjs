/**
 * Vertical Slice: Even Hub SDK Bridge (`@evenrealities/even_hub_sdk@0.0.16`).
 *
 * Imports ONLY `../../kernel/event_bus.mjs` and `@evenrealities/even_hub_sdk` (zero sibling imports).
 * Provides:
 * 1. `installMockFlutterWebViewHost(globalThis)` BEFORE dynamic SDK import so Node tests and
 *    standalone browsers execute the unmodified `@evenrealities/even_hub_sdk@0.0.16` bundle.
 * 2. Strict `576x288` Even G2 container construction + official `validateEvenHubPageContainer` checks.
 * 3. Bidirectional host-to-web event routing (`onEvenHubEvent`, `onDeviceStatusChanged`, `onLaunchSource`).
 */

import {
  DISPLAY_WIDTH,
  DISPLAY_HEIGHT,
  G2_BODY_HEIGHT_PX,
  G2_HEADER_HEIGHT_PX,
  G2_INNER_WIDTH_PX,
  G2_LINE_HEIGHT_PX,
  MAX_CONTAINERS_PER_PAGE,
  MAX_TEXT_CONTAINERS,
  MAX_MENU_ITEMS,
  MAX_MENU_ITEM_BYTES,
  TOPICS,
  clampBrightness,
  fitsG2Width,
  formatGlanceLines,
  isStrictBrightnessInteger,
  measureG2TextWidthPx,
  truncateG2LineByPx,
  utf8ByteCount,
  validateG2CardSpec,
} from "../../kernel/event_bus.mjs";

const DEFAULT_MENU_ITEMS = Object.freeze([
  Object.freeze({ itemID: 1, itemName: "Confirm / Approve" }),
  Object.freeze({ itemID: 2, itemName: "Dismiss Alert" }),
  Object.freeze({ itemID: 3, itemName: "Voice Reply Mic" }),
  Object.freeze({ itemID: 4, itemName: "Next Pulse Card" }),
]);

export function installMockFlutterWebViewHost(targetGlobal = globalThis, options = {}) {
  const listeners = new Map();
  const storageMap = new Map();
  const hostCallLog = [];

  const state = {
    startupCreated: false,
    shutDown: false,
    activePage: null,
    micOpen: false,
    micSource: "glasses",
    imuOpen: false,
    imuPace: 500,
    locationActive: false,
    user: {
      uid: options.uid ?? 2477,
      name: options.userName ?? "headsup_operator",
      avatar: "",
      country: options.country ?? "US",
    },
    device: {
      model: "g2",
      sn: options.sn ?? "ER-G2-576288",
      status: {
        sn: options.sn ?? "ER-G2-576288",
        connectType: "connected",
        isWearing: true,
        batteryLevel: 94,
        isCharging: false,
        isInCase: false,
      },
    },
  };

  if (typeof targetGlobal.CustomEvent === "undefined") {
    targetGlobal.CustomEvent = class CustomEvent {
      constructor(type, init = {}) {
        this.type = type;
        this.detail = init.detail;
      }
    };
  }

  if (typeof targetGlobal.document === "undefined") {
    targetGlobal.document = {
      readyState: "complete",
      addEventListener() {},
      removeEventListener() {},
    };
  }

  if (typeof targetGlobal.window === "undefined") {
    targetGlobal.window = {
      setTimeout: targetGlobal.setTimeout.bind(targetGlobal),
      clearTimeout: targetGlobal.clearTimeout.bind(targetGlobal),
      setInterval: targetGlobal.setInterval.bind(targetGlobal),
      clearInterval: targetGlobal.clearInterval.bind(targetGlobal),
      addEventListener(type, fn) {
        if (!listeners.has(type)) {
          listeners.set(type, new Set());
        }
        listeners.get(type).add(fn);
      },
      removeEventListener(type, fn) {
        listeners.get(type)?.delete(fn);
      },
      dispatchEvent(ev) {
        const type = ev?.type || String(ev);
        const set = listeners.get(type);
        if (set) {
          for (const fn of [...set]) {
            fn(ev);
          }
        }
        return true;
      },
    };
  }

  const win = targetGlobal.window;
  const hasNativeHost =
    Boolean(win.flutter_inappwebview?.callHandler) && !win.__headsupMockHost;

  if (!hasNativeHost) {
    win.flutter_inappwebview = {
      async callHandler(handlerName, rawMessage) {
        if (handlerName !== "evenAppMessage") {
          throw new Error(`Unexpected Flutter WebView handler '${handlerName}'`);
        }
        const parsed =
          typeof rawMessage === "string" ? JSON.parse(rawMessage) : rawMessage;
        const method = parsed?.method;
        const data = parsed?.data;

        let result = true;
        switch (method) {
          case "getUserInfo":
            result = { ...state.user };
            break;
          case "getGlassesInfo":
            result = {
              model: state.device.model,
              sn: state.device.sn,
              status: { ...state.device.status },
            };
            break;
          case "setLocalStorage":
            if (data?.key !== undefined) {
              storageMap.set(String(data.key), String(data.value ?? ""));
            }
            result = true;
            break;
          case "getLocalStorage": {
            const lookupKey = typeof data === "string" ? data : data?.key;
            result = storageMap.get(String(lookupKey ?? "")) ?? "";
            break;
          }
          case "getAppLocation":
            result = {
              latitude: 25.0953,
              longitude: 55.1592,
              accuracy: 8,
              timestamp: Date.now(),
            };
            break;
          case "startAppLocationUpdates":
            state.locationActive = true;
            result = true;
            break;
          case "stopAppLocationUpdates":
            state.locationActive = false;
            result = true;
            break;
          case "createStartUpPageContainer":
            state.startupCreated = true;
            state.shutDown = false;
            state.activePage = JSON.parse(JSON.stringify(data ?? {}));
            result = 0; // StartUpPageCreateResult.success
            break;
          case "rebuildPageContainer":
            state.activePage = JSON.parse(JSON.stringify(data ?? {}));
            result = true;
            break;
          case "textContainerUpgrade":
            if (state.activePage?.textObject && Array.isArray(state.activePage.textObject)) {
              for (const item of state.activePage.textObject) {
                if (
                  item.containerID === data?.containerID ||
                  item.containerName === data?.containerName
                ) {
                  if (typeof data?.content === "string") {
                    item.content = data.content;
                  }
                  if (data?.textColor !== undefined) {
                    item.textColor = data.textColor;
                  }
                }
              }
            }
            result = true;
            break;
          case "updateImageRawData":
            result = 0; // ImageRawDataUpdateResult.success
            break;
          case "audioControl": {
            const wantOpen = Boolean(data?.isOpen ?? data?.audioOpen ?? data?.open);
            const src = String(data?.source ?? "glasses");
            if (wantOpen && src === "glasses" && !state.startupCreated) {
              result = false;
            } else {
              state.micOpen = wantOpen;
              state.micSource = src;
              result = true;
            }
            break;
          }
          case "imuControl":
            state.imuOpen = Boolean(data?.isOpen ?? data?.iMUReportEn);
            state.imuPace = Number(data?.reportFrq ?? 500);
            result = true;
            break;
          case "shutDownPageContainer":
            state.shutDown = true;
            result = true;
            break;
          default:
            result = true;
            break;
        }

        hostCallLog.push({
          seq: hostCallLog.length + 1,
          timestamp: new Date().toISOString(),
          handlerName,
          type: parsed?.type,
          method,
          data: data === undefined ? null : JSON.parse(JSON.stringify(data)),
          result,
        });
        return result;
      },
    };

    const hostController = {
      isMockHost: true,
      getState: () => JSON.parse(JSON.stringify(state)),
      getCallLog: () => [...hostCallLog],
      pushLaunchSource(launchSource = "glassesMenu") {
        if (typeof win._listenEvenAppMessage === "function") {
          win._listenEvenAppMessage({
            type: "listen_even_app_data",
            method: "evenAppLaunchSource",
            data: { launchSource },
          });
        }
      },
      pushDeviceStatus(statusPatch = {}) {
        state.device.status = {
          ...state.device.status,
          sn: state.device.sn,
          ...statusPatch,
        };
        if (typeof win._listenEvenAppMessage === "function") {
          win._listenEvenAppMessage({
            type: "listen_even_app_data",
            method: "deviceStatusChanged",
            data: { ...state.device.status },
          });
        }
      },
      pushGesture({ eventType = 0, eventSource = 2 } = {}) {
        if (typeof win._listenEvenAppMessage === "function") {
          win._listenEvenAppMessage({
            type: "listen_even_app_data",
            method: "evenHubEvent",
            data: {
              type: "sysEvent",
              jsonData: { eventType, eventSource },
            },
          });
        }
      },
      pushMenuClick(itemID = 1) {
        if (typeof win._listenEvenAppMessage === "function") {
          win._listenEvenAppMessage({
            type: "listen_even_app_data",
            method: "evenHubEvent",
            data: {
              type: "menuItemClickEvent",
              jsonData: { itemID },
            },
          });
        }
      },
      pushAudioFrame({
        audioPcm = [12, 48, 96, 128, 64, 24, 8, 2],
        source = "glasses",
        direction = -6,
        speakerRole = "self",
      } = {}) {
        if (typeof win._listenEvenAppMessage === "function") {
          win._listenEvenAppMessage({
            type: "listen_even_app_data",
            method: "evenHubEvent",
            data: {
              type: "audioEvent",
              jsonData: {
                audioPcm: Array.from(audioPcm),
                source,
                direction,
                speakerRole,
              },
            },
          });
        }
      },
      pushImuReport({ x = 0.02, y = -0.11, z = 9.79 } = {}) {
        if (typeof win._listenEvenAppMessage === "function") {
          win._listenEvenAppMessage({
            type: "listen_even_app_data",
            method: "evenHubEvent",
            data: {
              type: "sysEvent",
              jsonData: {
                eventType: 8,
                imuData: { x, y, z },
              },
            },
          });
        }
      },
    };

    win.__headsupMockHost = hostController;
  }

  return win.__headsupMockHost || { isMockHost: false, getState: () => null, getCallLog: () => [] };
}

let sdkModulePromise = null;

export async function loadEvenHubSdk(targetGlobal = globalThis) {
  installMockFlutterWebViewHost(targetGlobal);
  if (!sdkModulePromise) {
    sdkModulePromise = import("@evenrealities/even_hub_sdk");
  }
  return sdkModulePromise;
}

export function buildCardHeaderLine(card, index = 0, total = 1) {
  const badge = card?.track === "crypto_defi" ? "PAPER" : "TG";
  const pos = `${index + 1}/${Math.max(1, total)}`;
  const rawTag = String(card?.headerTag || card?.title || "G2").replace(/^TG\s+/i, "");
  return truncateG2LineByPx(`[${pos}] ${badge} | ${rawTag}`, G2_INNER_WIDTH_PX, 40);
}

export function buildEvenG2PageContainer(card, sdk, options = {}) {
  const cardValidation = validateG2CardSpec(card);
  if (!cardValidation.valid) {
    throw new Error(`Invalid Even G2 card model: ${cardValidation.errors.join(" ")}`);
  }

  const brightness =
    card.brightness !== undefined ? card.brightness : clampBrightness(4);
  if (!isStrictBrightnessInteger(brightness)) {
    throw new RangeError(`Even G2 textColor brightness '${brightness}' must be an integer in 0..4.`);
  }

  const headerText = buildCardHeaderLine(
    card,
    options.cardIndex ?? 0,
    options.totalCards ?? 1
  );
  const formattedLines = formatGlanceLines(card.lines);
  const bodyContent = formattedLines.join("\n");

  const textObject = [
    {
      xPosition: 16,
      yPosition: 12,
      width: G2_INNER_WIDTH_PX,
      height: G2_HEADER_HEIGHT_PX,
      paddingLength: 0,
      borderWidth: 0,
      containerID: 1,
      containerName: "hud-header",
      zOrderIndex: 1,
      isEventCapture: 0,
      textColor: Math.min(4, Math.max(1, brightness - 1 >= 1 ? brightness - 1 : brightness)),
      content: headerText,
    },
    {
      xPosition: 16,
      yPosition: 56,
      width: G2_INNER_WIDTH_PX,
      height: G2_BODY_HEIGHT_PX,
      paddingLength: 0,
      borderWidth: 0,
      containerID: 2,
      containerName: "hud-body",
      zOrderIndex: 2,
      isEventCapture: 1,
      textColor: brightness,
      content: bodyContent,
    },
  ];

  const includeMenu = options.includeMenu !== false;
  const rawMenuItems = Array.isArray(options.menuItems)
    ? options.menuItems
    : DEFAULT_MENU_ITEMS;

  const pageContainer = {
    containerTotalNum: textObject.length,
    textObject,
  };

  if (includeMenu) {
    pageContainer.menuObject = {
      menuItems: rawMenuItems.map((item) => ({
        itemID: item.itemID,
        itemName: item.itemName,
      })),
    };
  }

  assertStrictPageContainerContract(pageContainer, sdk);
  return pageContainer;
}

export function assertStrictPageContainerContract(pageContainer, sdk) {
  if (!pageContainer || typeof pageContainer !== "object") {
    throw new Error("Page container must be a non-null object.");
  }

  const listObjs = pageContainer.listObject || [];
  const textObjs = pageContainer.textObject || [];
  const imageObjs = pageContainer.imageObject || [];
  const allContainers = [...listObjs, ...textObjs, ...imageObjs];

  if (
    allContainers.length < 1 ||
    allContainers.length > MAX_CONTAINERS_PER_PAGE ||
    pageContainer.containerTotalNum !== allContainers.length
  ) {
    throw new Error(
      `containerTotalNum (${pageContainer.containerTotalNum}) must match active containers (${allContainers.length}) within 1..${MAX_CONTAINERS_PER_PAGE}.`
    );
  }

  if (textObjs.length > MAX_TEXT_CONTAINERS) {
    throw new Error(`textObject length (${textObjs.length}) exceeds max ${MAX_TEXT_CONTAINERS}.`);
  }

  let captureCount = 0;
  for (const container of allContainers) {
    const x = Number(container.xPosition ?? 0);
    const y = Number(container.yPosition ?? 0);
    const w = Number(container.width ?? 0);
    const h = Number(container.height ?? 0);
    if (x < 0 || y < 0 || w <= 0 || h <= 0 || x + w > DISPLAY_WIDTH || y + h > DISPLAY_HEIGHT) {
      throw new Error(
        `Container '${container.containerName}' (${x},${y},${w}x${h}) overflows Even G2 ${DISPLAY_WIDTH}x${DISPLAY_HEIGHT} waveguide.`
      );
    }
    if (Number(container.isEventCapture) === 1) {
      captureCount += 1;
    }
    if (typeof container.content === "string") {
      const pad = Number(container.paddingLength ?? 0);
      const border = Number(container.borderWidth ?? 0);
      const innerWidth = Math.max(1, w - 2 * (pad + border));
      const check = fitsG2Width(container.content, innerWidth);
      if (!check.fits) {
        throw new Error(
          `Container '${container.containerName}' text width ${check.widthPx}px overflows innerWidth ${innerWidth}px.`
        );
      }
      const lineCount = container.content.split("\n").length;
      if (lineCount * G2_LINE_HEIGHT_PX > h) {
        throw new Error(
          `Container '${container.containerName}' height ${h}px clips ${lineCount} lines (${lineCount * G2_LINE_HEIGHT_PX}px required).`
        );
      }
    }
  }

  if (captureCount !== 1) {
    throw new Error(
      `Even G2 requires exactly 1 container with isEventCapture=1; found ${captureCount}.`
    );
  }

  if (pageContainer.menuObject?.menuItems) {
    const items = pageContainer.menuObject.menuItems;
    if (items.length > MAX_MENU_ITEMS) {
      throw new Error(`Contextual menu exceeds max ${MAX_MENU_ITEMS} items.`);
    }
    for (const item of items) {
      if (utf8ByteCount(item.itemName ?? "") > MAX_MENU_ITEM_BYTES) {
        throw new Error(
          `Menu item '${item.itemName}' exceeds ${MAX_MENU_ITEM_BYTES} UTF-8 bytes.`
        );
      }
    }
  }

  if (sdk?.validateEvenHubPageContainer) {
    const sdkValidation = sdk.validateEvenHubPageContainer(pageContainer);
    if (!sdkValidation.valid) {
      const formatted = sdk.formatEvenHubPageContainerValidationError
        ? sdk.formatEvenHubPageContainerValidationError(sdkValidation)
        : sdkValidation.message;
      throw new Error(`SDK page container validation failed (${sdkValidation.code}): ${formatted}`);
    }
  }

  return { valid: true };
}

function mapEventSourceLabel(sourceCode, EventSourceType) {
  if (sourceCode === EventSourceType?.TOUCH_EVENT_FROM_RING || sourceCode === 2) {
    return "RING";
  }
  if (sourceCode === EventSourceType?.TOUCH_EVENT_FROM_GLASSES_R || sourceCode === 1) {
    return "GLASSES_R";
  }
  if (sourceCode === EventSourceType?.TOUCH_EVENT_FROM_GLASSES_L || sourceCode === 3) {
    return "GLASSES_L";
  }
  return "GLASSES_DEFAULT";
}

export class EvenG2BridgeController {
  #eventBus;
  #sdk = null;
  #bridge = null;
  #host = null;
  #unsubscribers = [];
  #startupCreated = false;
  #launchSource = "glassesMenu";
  #userInfo = null;
  #deviceInfo = null;

  constructor({ eventBus }) {
    if (!eventBus) {
      throw new Error("EvenG2BridgeController requires an EventBus instance.");
    }
    this.#eventBus = eventBus;
  }

  async init(targetGlobal = globalThis) {
    this.#host = installMockFlutterWebViewHost(targetGlobal);
    this.#sdk = await loadEvenHubSdk(targetGlobal);
    this.#bridge = await this.#sdk.waitForEvenAppBridge();

    const unsubLaunch = this.#bridge.onLaunchSource((source) => {
      this.#launchSource = source;
      this.#eventBus.publish(TOPICS.GLASSES_DEVICE_STATUS, {
        kind: "launchSource",
        launchSource: source,
      });
    });

    const unsubStatus = this.#bridge.onDeviceStatusChanged((status) => {
      this.#eventBus.publish(TOPICS.GLASSES_DEVICE_STATUS, {
        kind: "deviceStatusChanged",
        status: typeof status?.toJson === "function" ? status.toJson() : status,
      });
    });

    const unsubHub = this.#bridge.onEvenHubEvent((event) => {
      this.#handleIncomingHubEvent(event);
    });

    this.#unsubscribers.push(unsubLaunch, unsubStatus, unsubHub);

    this.#userInfo = await this.#bridge.getUserInfo();
    this.#deviceInfo = await this.#bridge.getDeviceInfo();

    return {
      sdkVersion: "0.0.16",
      ready: this.#bridge.ready,
      isMockHost: Boolean(this.#host?.isMockHost),
      user: typeof this.#userInfo?.toJson === "function" ? this.#userInfo.toJson() : this.#userInfo,
      device:
        typeof this.#deviceInfo?.toJson === "function"
          ? this.#deviceInfo.toJson()
          : this.#deviceInfo,
    };
  }

  get sdk() {
    return this.#sdk;
  }

  get bridge() {
    return this.#bridge;
  }

  get host() {
    return this.#host;
  }

  get launchSource() {
    return this.#launchSource;
  }

  async renderStartupCard(card, options = {}) {
    if (!this.#bridge || !this.#sdk) {
      await this.init();
    }
    const pageContainer = buildEvenG2PageContainer(card, this.#sdk, options);
    const sdkValidation = this.#sdk.validateEvenHubPageContainer(pageContainer);
    const createResult = await this.#bridge.createStartUpPageContainer(pageContainer);
    if (createResult !== this.#sdk.StartUpPageCreateResult.success) {
      throw new Error(`createStartUpPageContainer rejected frame with code ${createResult}`);
    }
    this.#startupCreated = true;

    const frameRecord = {
      operation: "createStartUpPageContainer",
      resultCode: createResult,
      sdkValidation,
      cardId: card.id,
      brightness: pageContainer.textObject[1].textColor,
      pageContainer,
    };
    this.#eventBus.publish(TOPICS.GLASSES_FRAME_RENDERED, frameRecord);
    return frameRecord;
  }

  async upgradeCardText(card, options = {}) {
    if (!this.#startupCreated) {
      return this.renderStartupCard(card, options);
    }
    const pageContainer = buildEvenG2PageContainer(card, this.#sdk, options);
    const sdkValidation = this.#sdk.validateEvenHubPageContainer(pageContainer);
    const [headerObj, bodyObj] = pageContainer.textObject;

    const headerOk = await this.#bridge.textContainerUpgrade({
      containerID: headerObj.containerID,
      containerName: headerObj.containerName,
      contentOffset: 0,
      contentLength: headerObj.content.length,
      content: headerObj.content,
      textColor: headerObj.textColor,
    });
    const bodyOk = await this.#bridge.textContainerUpgrade({
      containerID: bodyObj.containerID,
      containerName: bodyObj.containerName,
      contentOffset: 0,
      contentLength: bodyObj.content.length,
      content: bodyObj.content,
      textColor: bodyObj.textColor,
    });

    if (!headerOk || !bodyOk) {
      throw new Error("textContainerUpgrade failed on Even G2 bridge.");
    }

    const frameRecord = {
      operation: "textContainerUpgrade",
      resultCode: 0,
      sdkValidation,
      cardId: card.id,
      brightness: bodyObj.textColor,
      pageContainer,
    };
    this.#eventBus.publish(TOPICS.GLASSES_FRAME_RENDERED, frameRecord);
    return frameRecord;
  }

  async rebuildCardPage(card, options = {}) {
    if (!this.#bridge || !this.#sdk) {
      await this.init();
    }
    const pageContainer = buildEvenG2PageContainer(card, this.#sdk, options);
    const sdkValidation = this.#sdk.validateEvenHubPageContainer(pageContainer);
    const ok = await this.#bridge.rebuildPageContainer(pageContainer);
    if (!ok) {
      throw new Error("rebuildPageContainer returned false.");
    }
    const frameRecord = {
      operation: "rebuildPageContainer",
      resultCode: 0,
      sdkValidation,
      cardId: card.id,
      brightness: pageContainer.textObject[1].textColor,
      pageContainer,
    };
    this.#eventBus.publish(TOPICS.GLASSES_FRAME_RENDERED, frameRecord);
    return frameRecord;
  }

  async setMicrophone(isOpen, source) {
    if (!this.#bridge || !this.#sdk) {
      await this.init();
    }
    const targetSource = source ?? this.#sdk.AudioInputSource.Glasses;
    return this.#bridge.audioControl(Boolean(isOpen), targetSource);
  }

  async setImu(isOpen, pace) {
    if (!this.#bridge || !this.#sdk) {
      await this.init();
    }
    const targetPace = pace ?? this.#sdk.ImuReportPace.P500;
    return this.#bridge.imuControl(Boolean(isOpen), targetPace);
  }

  async shutdown(exitMode = 0) {
    for (const unsub of this.#unsubscribers.splice(0)) {
      if (typeof unsub === "function") {
        unsub();
      }
    }
    if (this.#bridge) {
      return this.#bridge.shutDownPageContainer(exitMode);
    }
    return true;
  }

  #handleIncomingHubEvent(event) {
    const { OsEventTypeList, EventSourceType } = this.#sdk;

    if (event?.menuItemClickEvent) {
      const itemID = Number(event.menuItemClickEvent.itemID);
      const menuGestureMap = {
        1: "TAP_CONFIRM",
        2: "DOUBLE_TAP_DISMISS",
        3: "VOICE_PTT_TOGGLE",
        4: "SCROLL_NEXT",
      };
      this.#eventBus.publish(TOPICS.GLASSES_INPUT_GESTURE, {
        gesture: menuGestureMap[itemID] || "MENU_SELECT",
        menuItemID: itemID,
        source: "GLASSES_MENU",
      });
      return;
    }

    if (event?.audioEvent) {
      const audio = event.audioEvent;
      this.#eventBus.publish(TOPICS.GLASSES_VOICE_CAPTURED, {
        byteLength: audio.audioPcm?.length ?? 0,
        pcmSamplePreview: Array.from((audio.audioPcm || []).slice(0, 8)),
        source: audio.source,
        direction: audio.direction,
        speakerRole: audio.speakerRole,
      });
      return;
    }

    const targetEvent = event?.textEvent || event?.sysEvent;
    if (targetEvent) {
      const sourceLabel = mapEventSourceLabel(targetEvent.eventSource, EventSourceType);
      // Proto3 omits default zero `eventType: 0` (CLICK_EVENT) when neither imuData nor exit code is present
      const evType =
        targetEvent.eventType ??
        (!targetEvent.imuData && targetEvent.systemExitReasonCode === undefined
          ? OsEventTypeList.CLICK_EVENT
          : undefined);

      if (evType === OsEventTypeList.IMU_DATA_REPORT && targetEvent.imuData) {
        this.#eventBus.publish(TOPICS.GLASSES_DEVICE_STATUS, {
          kind: "imuReport",
          imu: {
            x: targetEvent.imuData.x,
            y: targetEvent.imuData.y,
            z: targetEvent.imuData.z,
          },
        });
        return;
      }

      const gestureMap = {
        [OsEventTypeList.CLICK_EVENT]: "TAP_CONFIRM",
        [OsEventTypeList.DOUBLE_CLICK_EVENT]: "DOUBLE_TAP_DISMISS",
        [OsEventTypeList.SCROLL_BOTTOM_EVENT]: "SCROLL_NEXT",
        [OsEventTypeList.SCROLL_TOP_EVENT]: "SCROLL_PREV",
        [OsEventTypeList.LONG_PRESS_EVENT]: "VOICE_PTT_START",
        [OsEventTypeList.LONG_PRESS_RELEASE_EVENT]: "VOICE_PTT_END",
      };
      const gesture = gestureMap[evType];
      if (gesture) {
        this.#eventBus.publish(TOPICS.GLASSES_INPUT_GESTURE, {
          gesture,
          eventType: evType,
          source: sourceLabel,
        });
      }
    }
  }
}
