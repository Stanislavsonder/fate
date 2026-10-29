(function(){try{if(typeof document<`u`){var e=document.createElement(`style`);e.appendChild(document.createTextNode(`.example-section[data-v-5effc38e]{--background:var(--ion-color-light)}
/*$vite$:1*/`)),document.head.appendChild(e)}}catch(e){console.error(`vite-plugin-css-injected-by-js`,e)}})();//#region ../mod-types/src/bundle.ts
function e(e) {
	return e;
}
var t = /^[a-z0-9-]+@[a-z0-9-]+$/;
function n(e, n) {
	if (!t.test(e)) throw Error(`"${String(e)}" is not a valid mod id — expected "author@name"`);
	if (typeof n != "string" || n.length === 0) throw Error("mod data key must be a non-empty string");
	return `${e}.${n}`;
}
function r(e, t, r) {
	return e[n(t, r)];
}
function i(e, t, r, i) {
	e[n(t, r)] = i;
}
function a(e, t, r) {
	let i = e;
	if (r !== void 0) {
		delete i[n(t, r)];
		return;
	}
	let a = n(t, "_").slice(0, -1);
	for (let e of Object.keys(i)) e.startsWith(a) && delete i[e];
}
//#endregion
//#region \0fate-sdk-shim:vue
var o = globalThis.FateSDK.vue;
o.BaseTransition, o.BaseTransitionPropsValidators, o.Comment, o.DeprecationTypes, o.EffectScope, o.ErrorCodes, o.ErrorTypeStrings, o.Fragment, o.KeepAlive, o.ReactiveEffect, o.Static, o.Suspense, o.Teleport, o.Text, o.TrackOpTypes, o.Transition, o.TransitionGroup, o.TriggerOpTypes, o.VueElement, o.assertNumber, o.callWithAsyncErrorHandling, o.callWithErrorHandling, o.camelize, o.capitalize, o.cloneVNode, o.compatUtils, o.compile, o.computed, o.createApp;
var s = o.createBlock;
o.createCommentVNode, o.createElementBlock, o.createElementVNode, o.createHydrationRenderer, o.createPropsRestProxy, o.createRenderer, o.createSSRApp, o.createSlots, o.createStaticVNode;
var c = o.createTextVNode, l = o.createVNode;
o.customRef, o.defineAsyncComponent;
var u = o.defineComponent;
o.defineCustomElement, o.defineEmits, o.defineExpose, o.defineModel, o.defineOptions, o.defineProps, o.defineSSRCustomElement, o.defineSlots, o.devtools, o.effect, o.effectScope, o.getCurrentInstance, o.getCurrentScope, o.getCurrentWatcher, o.getTransitionRawChildren, o.guardReactiveProps, o.h, o.handleError, o.hasInjectionContext, o.hydrate, o.hydrateOnIdle, o.hydrateOnInteraction, o.hydrateOnMediaQuery, o.hydrateOnVisible, o.initCustomFormatter, o.initDirectivesForSSR;
var d = o.inject;
o.isMemoSame, o.isProxy, o.isReactive, o.isReadonly, o.isRef, o.isRuntimeOnly, o.isShallow, o.isVNode, o.markRaw, o.mergeDefaults, o.mergeModels, o.mergeProps, o.nextTick, o.nodeOps, o.normalizeClass, o.normalizeProps, o.normalizeStyle, o.onActivated, o.onBeforeMount, o.onBeforeUnmount, o.onBeforeUpdate, o.onDeactivated, o.onErrorCaptured, o.onMounted, o.onRenderTracked, o.onRenderTriggered, o.onScopeDispose, o.onServerPrefetch, o.onUnmounted, o.onUpdated, o.onWatcherCleanup;
var f = o.openBlock;
o.patchProp, o.popScopeId, o.provide, o.proxyRefs, o.pushScopeId, o.queuePostFlushCb, o.reactive, o.readonly, o.ref, o.registerRuntimeCompiler, o.render, o.renderList, o.renderSlot, o.resolveComponent, o.resolveDirective, o.resolveDynamicComponent, o.resolveFilter, o.resolveTransitionHooks, o.setBlockTracking, o.setDevtoolsHook, o.setTransitionHooks, o.shallowReactive, o.shallowReadonly, o.shallowRef, o.ssrContextKey, o.ssrUtils, o.stop;
var p = o.toDisplayString;
o.toHandlerKey, o.toHandlers, o.toRaw, o.toRef, o.toRefs, o.toValue, o.transformVNodeArgs, o.triggerRef;
var m = o.unref;
o.useAttrs, o.useCssModule, o.useCssVars, o.useHost, o.useId;
var h = o.useModel;
o.useSSRContext, o.useShadowRoot, o.useSlots, o.useTemplateRef, o.useTransitionState, o.vModelCheckbox, o.vModelDynamic, o.vModelRadio, o.vModelSelect, o.vModelText, o.vShow, o.version, o.warn, o.watch, o.watchEffect, o.watchPostEffect, o.watchSyncEffect, o.withAsyncContext;
var g = o.withCtx;
o.withDefaults, o.withDirectives, o.withKeys, o.withMemo, o.withModifiers, o.withScopeId;
//#endregion
//#region \0fate-sdk-shim:@ionic/vue
var _ = globalThis.FateSDK.ionicVue;
_.IonAccordion, _.IonAccordionGroup, _.IonActionSheet, _.IonAlert, _.IonApp, _.IonAvatar, _.IonBackButton, _.IonBackdrop, _.IonBadge, _.IonBreadcrumb, _.IonBreadcrumbs, _.IonButton, _.IonButtons;
var v = _.IonCard, y = _.IonCardContent, b = _.IonCardHeader;
_.IonCardSubtitle;
var x = _.IonCardTitle;
_.IonCheckbox, _.IonChip, _.IonCol, _.IonContent, _.IonDatetime, _.IonDatetimeButton, _.IonFab, _.IonFabButton, _.IonFabList, _.IonFooter, _.IonGrid, _.IonHeader, _.IonIcon, _.IonImg, _.IonInfiniteScroll, _.IonInfiniteScrollContent;
var S = _.IonInput;
_.IonInputOtp, _.IonInputPasswordToggle;
var C = _.IonItem;
_.IonItemDivider, _.IonItemGroup, _.IonItemOption, _.IonItemOptions, _.IonItemSliding, _.IonLabel, _.IonList, _.IonListHeader, _.IonLoading, _.IonMenu, _.IonMenuButton, _.IonMenuToggle, _.IonModal, _.IonNav, _.IonNavLink;
var w = _.IonNote;
_.IonPage, _.IonPicker, _.IonPickerColumn, _.IonPickerColumnOption, _.IonPickerLegacy, _.IonPopover, _.IonProgressBar, _.IonRadio, _.IonRadioGroup, _.IonRange, _.IonRefresher, _.IonRefresherContent, _.IonReorder, _.IonReorderGroup, _.IonRippleEffect, _.IonRouterOutlet, _.IonRow, _.IonSearchbar, _.IonSegment, _.IonSegmentButton, _.IonSegmentContent, _.IonSegmentView, _.IonSelect, _.IonSelectModal, _.IonSelectOption, _.IonSkeletonText, _.IonSpinner, _.IonSplitPane, _.IonTab, _.IonTabBar, _.IonTabButton, _.IonTabs, _.IonText, _.IonTextarea, _.IonThumbnail, _.IonTitle, _.IonToast, _.IonToggle, _.IonToolbar, _.IonicSafeString, _.IonicSlides, _.IonicVue, _.actionSheetController, _.alertController, _.createAnimation, _.createGesture, _.getIonPageElement, _.getPlatforms, _.getTimeGivenProgression, _.iosTransitionAnimation, _.isPlatform, _.loadingController, _.mdTransitionAnimation, _.menuController, _.modalController, _.onIonViewDidEnter, _.onIonViewDidLeave, _.onIonViewWillEnter, _.onIonViewWillLeave, _.openURL, _.pickerController, _.popoverController, _.toastController, _.useBackButton, _.useIonRouter, _.useKeyboard;
var T = {
	appVersion: ">=2.0.0",
	author: {
		email: "stanislavsonder@gmail.com",
		name: "Stanislav Sonder"
	},
	capabilities: ["sheetComponents"],
	config: {
		groups: [],
		options: [{
			default: 200,
			id: "max-note-length",
			limits: {
				max: 1e3,
				min: 10,
				step: 10
			},
			name: "t.config.maxNoteLength.name",
			tooltip: "t.config.maxNoteLength.tooltip",
			type: "number"
		}]
	},
	description: {
		full: "t.description.full",
		short: "t.description.short"
	},
	entry: "bundle.mjs",
	id: "sonder@example",
	languages: ["en"],
	loadPriority: 100,
	name: "t.name",
	sdk: "^3.0.0",
	tags: ["example"],
	version: "1.0.0"
}, E = "note", D = "sonder@example.maxNoteLength", O = [{
	id: "sonder@example-section",
	component: /* @__PURE__ */ ((e, t) => {
		let n = e.__vccOpts || e;
		for (let [e, r] of t) n[e] = r;
		return n;
	})(/* @__PURE__ */ u({
		__name: "ExampleSection",
		props: {
			modelValue: { required: !0 },
			modelModifiers: {}
		},
		emits: ["update:modelValue"],
		setup(e) {
			let t = h(e, "modelValue"), n = d("context");
			function a(e) {
				let r = String(e.target.value ?? ""), a = Number(n.value.constants[D] ?? 200);
				i(t.value, T.id, E, r.slice(0, a));
			}
			return (e, i) => (f(), s(m(v), { class: "example-section" }, {
				default: g(() => [l(m(b), null, {
					default: g(() => [l(m(x), null, {
						default: g(() => [c(p(e.$t("sonder@example.title")), 1)]),
						_: 1
					})]),
					_: 1
				}), l(m(y), null, {
					default: g(() => [l(m(C), null, {
						default: g(() => [l(m(S), {
							label: e.$t("sonder@example.noteLabel"),
							"label-placement": "stacked",
							"model-value": m(r)(t.value, m(T).id, E) ?? "",
							onIonInput: a
						}, null, 8, ["label", "model-value"])]),
						_: 1
					}), l(m(w), null, {
						default: g(() => [c(p(e.$t("sonder@example.maxLengthNote", { value: m(n).constants[D] ?? 200 })), 1)]),
						_: 1
					})]),
					_: 1
				})]),
				_: 1
			}));
		}
	}), [["__scopeId", "data-v-5effc38e"]]),
	order: 900
}], k = "note", A = "max-note-length", j = "sonder@example.maxNoteLength", M = 200;
function N(e, t) {
	let n = t._modules[T.id]?.config, r = n && Object.hasOwn(n, A) ? Number(n[A]) : NaN;
	e.constants[j] = Number.isFinite(r) ? r : M;
}
function P(e, t) {
	N(e, t), i(t, T.id, k, r(t, T.id, k) ?? "");
}
function F(e, t) {
	a(t, T.id);
}
function I(e, t) {
	N(e, t);
}
//#endregion
//#region bundle.ts
var L = e({
	components: O,
	onInstall: P,
	onUninstall: F,
	onReconfigure: I
});
//#endregion
export { L as default };
