//#region ../mod-types/src/bundle.ts
function e(e) {
	return e;
}
//#endregion
//#region ../mod-types/src/dice.ts
var t = class {
	name;
	faceMaterial;
	symbolMaterial;
	previewColor;
	constructor(e, t, n, r) {
		this.name = e, this.faceMaterial = t, this.symbolMaterial = n, this.previewColor = r;
	}
}, n = class {
	material;
	size;
	quality;
	mass;
	world;
	onCollide;
	static name;
	static icon;
	mesh;
	body;
	constructor(e, t, n, r, i, a) {
		this.material = e, this.size = t, this.quality = n, this.mass = r, this.world = i, this.onCollide = a, this.mesh = this.createMesh(), this.body = this.createBody(this.world, this.onCollide);
	}
}, r = globalThis.FateSDK.dice.three;
r.ACESFilmicToneMapping, r.AddEquation, r.AddOperation, r.AdditiveAnimationBlendMode, r.AdditiveBlending, r.AgXToneMapping, r.AlphaFormat, r.AlwaysCompare, r.AlwaysDepth, r.AlwaysStencilFunc, r.AmbientLight, r.AnimationAction, r.AnimationClip, r.AnimationLoader, r.AnimationMixer, r.AnimationObjectGroup, r.AnimationUtils, r.ArcCurve, r.ArrayCamera, r.ArrowHelper, r.AttachedBindMode, r.Audio, r.AudioAnalyser, r.AudioContext, r.AudioListener, r.AudioLoader, r.AxesHelper, r.BackSide, r.BasicDepthPacking, r.BasicShadowMap, r.BatchedMesh, r.BezierInterpolant, r.Bone, r.BooleanKeyframeTrack, r.Box2, r.Box3, r.Box3Helper;
var i = r.BoxGeometry;
r.BoxHelper, r.BufferAttribute, r.BufferGeometry, r.BufferGeometryLoader, r.ByteType, r.Cache, r.Camera, r.CameraHelper;
var a = r.CanvasTexture;
r.CapsuleGeometry, r.CatmullRomCurve3, r.CineonToneMapping, r.CircleGeometry, r.ClampToEdgeWrapping, r.Clock, r.Color, r.ColorKeyframeTrack, r.ColorManagement, r.Compatibility, r.CompressedArrayTexture, r.CompressedCubeTexture, r.CompressedTexture, r.CompressedTextureLoader, r.ConeGeometry, r.ConstantAlphaFactor, r.ConstantColorFactor, r.Controls, r.CubeCamera, r.CubeDepthTexture, r.CubeReflectionMapping, r.CubeRefractionMapping, r.CubeTexture, r.CubeTextureLoader, r.CubeUVReflectionMapping, r.CubicBezierCurve, r.CubicBezierCurve3, r.CubicInterpolant, r.CullFaceBack, r.CullFaceFront, r.CullFaceFrontBack, r.CullFaceNone, r.Curve, r.CurvePath, r.CustomBlending, r.CustomToneMapping, r.CylinderGeometry, r.Cylindrical, r.Data3DTexture, r.DataArrayTexture, r.DataTexture, r.DataTextureLoader, r.DataUtils, r.DecrementStencilOp, r.DecrementWrapStencilOp, r.DefaultLoadingManager, r.DepthFormat, r.DepthStencilFormat, r.DepthTexture, r.DetachedBindMode, r.DirectionalLight, r.DirectionalLightHelper, r.DiscreteInterpolant, r.DodecahedronGeometry, r.DoubleSide, r.DstAlphaFactor, r.DstColorFactor, r.DynamicCopyUsage, r.DynamicDrawUsage, r.DynamicReadUsage, r.EdgesGeometry, r.EllipseCurve, r.EqualCompare, r.EqualDepth, r.EqualStencilFunc, r.EquirectangularReflectionMapping, r.EquirectangularRefractionMapping, r.Euler, r.EventDispatcher, r.ExternalTexture, r.ExtrudeGeometry, r.FileLoader, r.Float16BufferAttribute, r.Float32BufferAttribute, r.FloatType, r.Fog, r.FogExp2, r.FramebufferTexture, r.FrontSide, r.Frustum, r.FrustumArray, r.GLBufferAttribute, r.GLSL1, r.GLSL3, r.GreaterCompare, r.GreaterDepth, r.GreaterEqualCompare, r.GreaterEqualDepth, r.GreaterEqualStencilFunc, r.GreaterStencilFunc, r.GridHelper;
var o = r.Group;
r.HTMLTexture, r.HalfFloatType, r.HemisphereLight, r.HemisphereLightHelper, r.IcosahedronGeometry, r.ImageBitmapLoader, r.ImageLoader, r.ImageUtils, r.IncrementStencilOp, r.IncrementWrapStencilOp, r.InstancedBufferAttribute, r.InstancedBufferGeometry, r.InstancedInterleavedBuffer, r.InstancedMesh, r.Int16BufferAttribute, r.Int32BufferAttribute, r.Int8BufferAttribute, r.IntType, r.InterleavedBuffer, r.InterleavedBufferAttribute, r.Interpolant, r.InterpolateBezier, r.InterpolateDiscrete, r.InterpolateLinear, r.InterpolateSmooth, r.InterpolationSamplingMode, r.InterpolationSamplingType, r.InvertStencilOp, r.KeepStencilOp, r.KeyframeTrack, r.LOD, r.LatheGeometry, r.Layers, r.LessCompare, r.LessDepth, r.LessEqualCompare, r.LessEqualDepth, r.LessEqualStencilFunc, r.LessStencilFunc, r.Light, r.LightProbe, r.Line, r.Line3, r.LineBasicMaterial, r.LineCurve, r.LineCurve3, r.LineDashedMaterial, r.LineLoop, r.LineSegments, r.LinearFilter, r.LinearInterpolant, r.LinearMipMapLinearFilter, r.LinearMipMapNearestFilter, r.LinearMipmapLinearFilter, r.LinearMipmapNearestFilter, r.LinearSRGBColorSpace, r.LinearToneMapping, r.LinearTransfer, r.Loader, r.LoaderUtils, r.LoadingManager, r.LoopOnce, r.LoopPingPong, r.LoopRepeat, r.MOUSE, r.Material, r.MaterialBlending, r.MaterialLoader, r.MathUtils, r.Matrix2, r.Matrix3;
var s = r.Matrix4;
r.MaxEquation;
var c = r.Mesh;
r.MeshBasicMaterial, r.MeshDepthMaterial, r.MeshDistanceMaterial, r.MeshLambertMaterial, r.MeshMatcapMaterial, r.MeshNormalMaterial, r.MeshPhongMaterial, r.MeshPhysicalMaterial;
var l = r.MeshStandardMaterial;
r.MeshToonMaterial, r.MinEquation, r.MirroredRepeatWrapping, r.MixOperation, r.MultiplyBlending, r.MultiplyOperation, r.NearestFilter, r.NearestMipMapLinearFilter, r.NearestMipMapNearestFilter, r.NearestMipmapLinearFilter, r.NearestMipmapNearestFilter, r.NeutralToneMapping, r.NeverCompare, r.NeverDepth, r.NeverStencilFunc, r.NoBlending, r.NoColorSpace, r.NoNormalPacking, r.NoToneMapping, r.NormalAnimationBlendMode, r.NormalBlending, r.NormalGAPacking, r.NormalRGPacking, r.NotEqualCompare, r.NotEqualDepth, r.NotEqualStencilFunc, r.NumberKeyframeTrack, r.Object3D, r.ObjectLoader, r.ObjectSpaceNormalMap, r.OctahedronGeometry, r.OneFactor, r.OneMinusConstantAlphaFactor, r.OneMinusConstantColorFactor, r.OneMinusDstAlphaFactor, r.OneMinusDstColorFactor, r.OneMinusSrcAlphaFactor, r.OneMinusSrcColorFactor, r.OrthographicCamera, r.PCFShadowMap, r.PCFSoftShadowMap, r.PMREMGenerator, r.Path, r.PerspectiveCamera, r.Plane;
var u = r.PlaneGeometry;
r.PlaneHelper, r.PointLight, r.PointLightHelper, r.Points, r.PointsMaterial, r.PolarGridHelper, r.PolyhedronGeometry, r.PositionalAudio, r.PropertyBinding, r.PropertyMixer, r.QuadraticBezierCurve, r.QuadraticBezierCurve3, r.Quaternion, r.QuaternionKeyframeTrack, r.QuaternionLinearInterpolant, r.R11_EAC_Format, r.RED_GREEN_RGTC2_Format, r.RED_RGTC1_Format, r.REVISION, r.RG11_EAC_Format, r.RGBADepthPacking, r.RGBAFormat, r.RGBAIntegerFormat, r.RGBA_ASTC_10x10_Format, r.RGBA_ASTC_10x5_Format, r.RGBA_ASTC_10x6_Format, r.RGBA_ASTC_10x8_Format, r.RGBA_ASTC_12x10_Format, r.RGBA_ASTC_12x12_Format, r.RGBA_ASTC_4x4_Format, r.RGBA_ASTC_5x4_Format, r.RGBA_ASTC_5x5_Format, r.RGBA_ASTC_6x5_Format, r.RGBA_ASTC_6x6_Format, r.RGBA_ASTC_8x5_Format, r.RGBA_ASTC_8x6_Format, r.RGBA_ASTC_8x8_Format, r.RGBA_BPTC_Format, r.RGBA_ETC2_EAC_Format, r.RGBA_PVRTC_2BPPV1_Format, r.RGBA_PVRTC_4BPPV1_Format, r.RGBA_S3TC_DXT1_Format, r.RGBA_S3TC_DXT3_Format, r.RGBA_S3TC_DXT5_Format, r.RGBDepthPacking, r.RGBFormat, r.RGBIntegerFormat, r.RGB_BPTC_SIGNED_Format, r.RGB_BPTC_UNSIGNED_Format, r.RGB_ETC1_Format, r.RGB_ETC2_Format, r.RGB_PVRTC_2BPPV1_Format, r.RGB_PVRTC_4BPPV1_Format, r.RGB_S3TC_DXT1_Format, r.RGDepthPacking, r.RGFormat, r.RGIntegerFormat, r.RawShaderMaterial, r.Ray, r.Raycaster, r.RectAreaLight, r.RedFormat, r.RedIntegerFormat, r.ReinhardToneMapping, r.RenderTarget, r.RenderTarget3D, r.RepeatWrapping, r.ReplaceStencilOp, r.ReverseSubtractEquation, r.RingGeometry, r.SIGNED_R11_EAC_Format, r.SIGNED_RED_GREEN_RGTC2_Format, r.SIGNED_RED_RGTC1_Format, r.SIGNED_RG11_EAC_Format, r.SRGBColorSpace, r.SRGBTransfer, r.Scene, r.ShaderChunk, r.ShaderLib, r.ShaderMaterial, r.ShadowMaterial, r.Shape, r.ShapeGeometry, r.ShapePath, r.ShapeUtils, r.ShortType, r.Skeleton, r.SkeletonHelper, r.SkinnedMesh, r.Source, r.Sphere, r.SphereGeometry, r.Spherical, r.SphericalHarmonics3, r.SplineCurve, r.SpotLight, r.SpotLightHelper, r.Sprite, r.SpriteMaterial, r.SrcAlphaFactor, r.SrcAlphaSaturateFactor, r.SrcColorFactor, r.StaticCopyUsage, r.StaticDrawUsage, r.StaticReadUsage, r.StereoCamera, r.StreamCopyUsage, r.StreamDrawUsage, r.StreamReadUsage, r.StringKeyframeTrack, r.SubtractEquation, r.SubtractiveBlending, r.TOUCH, r.TangentSpaceNormalMap, r.TetrahedronGeometry, r.Texture, r.TextureLoader, r.TextureUtils, r.Timer, r.TimestampQuery, r.TorusGeometry, r.TorusKnotGeometry, r.Triangle, r.TriangleFanDrawMode, r.TriangleStripDrawMode, r.TrianglesDrawMode, r.TubeGeometry, r.UVMapping, r.Uint16BufferAttribute, r.Uint32BufferAttribute, r.Uint8BufferAttribute, r.Uint8ClampedBufferAttribute, r.Uniform, r.UniformsGroup, r.UniformsLib, r.UniformsUtils, r.UnsignedByteType, r.UnsignedInt101111Type, r.UnsignedInt248Type, r.UnsignedInt5999Type, r.UnsignedIntType, r.UnsignedShort4444Type, r.UnsignedShort5551Type, r.UnsignedShortType, r.VSMShadowMap, r.Vector2;
var d = r.Vector3;
r.Vector4, r.VectorKeyframeTrack, r.VideoFrameTexture, r.VideoTexture, r.WebGL3DRenderTarget, r.WebGLArrayRenderTarget, r.WebGLCoordinateSystem, r.WebGLCubeRenderTarget, r.WebGLRenderTarget, r.WebGLRenderer, r.WebGLUtils, r.WebGPUCoordinateSystem, r.WebXRController, r.WireframeGeometry, r.WrapAroundEnding, r.ZeroCurvatureEnding, r.ZeroFactor, r.ZeroSlopeEnding, r.ZeroStencilOp, r.createCanvasElement, r.error, r.getConsoleFunction, r.log, r.setConsoleFunction, r.warn, r.warnOnce;
//#endregion
//#region \0fate-sdk-shim:cannon-es
var f = globalThis.FateSDK.dice.cannonEs;
f.AABB, f.ArrayCollisionMatrix, f.BODY_SLEEP_STATES, f.BODY_TYPES;
var p = f.Body, m = f.Box;
f.Broadphase, f.COLLISION_TYPES, f.ConeTwistConstraint, f.Constraint, f.ContactEquation, f.ContactMaterial, f.ConvexPolyhedron, f.Cylinder, f.DistanceConstraint, f.Equation, f.EventTarget, f.FrictionEquation, f.GSSolver, f.GridBroadphase, f.Heightfield, f.HingeConstraint, f.JacobianElement, f.LockConstraint, f.Mat3, f.Material, f.NaiveBroadphase, f.Narrowphase, f.ObjectCollisionMatrix, f.Particle, f.Plane, f.PointToPointConstraint, f.Pool, f.Quaternion, f.RAY_MODES, f.Ray, f.RaycastResult, f.RaycastVehicle, f.RigidVehicle, f.RotationalEquation, f.RotationalMotorEquation, f.SAPBroadphase, f.SHAPE_TYPES, f.SPHSystem, f.Shape, f.Solver, f.Sphere, f.SplitSolver, f.Spring, f.Transform, f.Trimesh;
var h = f.Vec3;
f.Vec3Pool, f.WheelInfo, f.World;
//#endregion
//#region src/d6.ts
var g = [
	{
		value: 1,
		normal: [
			0,
			1,
			0
		]
	},
	{
		value: 6,
		normal: [
			0,
			-1,
			0
		]
	},
	{
		value: 2,
		normal: [
			1,
			0,
			0
		]
	},
	{
		value: 5,
		normal: [
			-1,
			0,
			0
		]
	},
	{
		value: 3,
		normal: [
			0,
			0,
			1
		]
	},
	{
		value: 4,
		normal: [
			0,
			0,
			-1
		]
	}
];
function _(e, t) {
	let n = document.createElement("canvas"), r = n.getContext("2d");
	if (!r) return null;
	n.width = 128, n.height = 128, r.font = "bold 80px Arial", r.fillStyle = "white", r.textAlign = "center", r.textBaseline = "middle", r.fillText(e.toString(), 128 / 2, 128 / 2);
	let i = new a(n), o = t.symbolMaterial.clone();
	return o.map = i, o.transparent = !0, new c(new u(.5, .5), o);
}
function v(e, t) {
	let n = new o(), r = new c(new i(t, t, t), e.faceMaterial);
	r.castShadow = !0, r.receiveShadow = !0, n.add(r);
	for (let r of g) {
		let i = new d(...r.normal), a = _(r.value, e);
		a && (a.position.copy(i).multiplyScalar(t / 2 + .001), a.lookAt(i.clone().multiplyScalar(t)), n.add(a));
	}
	return n;
}
function y(e, t, n, r) {
	let i = t / 2, a = new p({
		mass: n,
		shape: new m(new h(i, i, i)),
		sleepTimeLimit: .2
	});
	return a.collisionResponse = !0, a.collisionFilterGroup = 1, a.collisionFilterMask = 1, a.angularDamping = .3, a.linearDamping = .3, a.sleepSpeedLimit = .4, a.sleepTimeLimit = .5, a.allowSleep = !0, a.addEventListener("collide", r), e.addBody(a), a;
}
function b(e) {
	let t = new s().extractRotation(e.mesh.matrixWorld), n = new d(0, 1, 0), r = g[0].value, i = -Infinity;
	for (let e of g) {
		let a = new d(...e.normal).applyMatrix4(t).normalize().dot(n);
		a > i && (i = a, r = e.value);
	}
	return r;
}
var x = class e extends n {
	static name = "D6";
	static icon = "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%3E%3Crect%20x%3D%223%22%20y%3D%223%22%20width%3D%2218%22%20height%3D%2218%22%20rx%3D%223%22%20fill%3D%22none%22%20stroke%3D%22currentColor%22%20stroke-width%3D%222%22%2F%3E%3Ccircle%20cx%3D%228%22%20cy%3D%228%22%20r%3D%221.6%22%20fill%3D%22currentColor%22%2F%3E%3Ccircle%20cx%3D%2212%22%20cy%3D%2212%22%20r%3D%221.6%22%20fill%3D%22currentColor%22%2F%3E%3Ccircle%20cx%3D%2216%22%20cy%3D%2216%22%20r%3D%221.6%22%20fill%3D%22currentColor%22%2F%3E%3C%2Fsvg%3E";
	constructor(e, t, n, r, i, a) {
		super(e, t, n, r, i, a);
	}
	getResult() {
		return b(this);
	}
	formatResult(e) {
		let t = Array.isArray(e) ? e : [e];
		return {
			value: t.reduce((e, t) => e + t, 0),
			values: t,
			text: t.map((e) => e.toString()).join(", "),
			color: t.every((e) => e === 6) ? "success" : t.every((e) => e === 1) ? "danger" : "medium"
		};
	}
	changeMaterial(e) {
		this.material = e, this.mesh = this.createMesh();
	}
	createMesh() {
		return v(this.material, this.size);
	}
	createBody(e, t) {
		return y(e, this.size, this.mass, t);
	}
	clone() {
		let t = new e(this.material, this.size, this.quality, this.mass, this.world, this.onCollide);
		return t.body.position.copy(this.body.position), t.body.quaternion.copy(this.body.quaternion), t.mesh.position.copy(this.mesh.position), t.mesh.quaternion.copy(this.mesh.quaternion), t;
	}
}, S = new t("Gold", new l({
	color: 13938487,
	metalness: .6,
	roughness: .35
}), new l({ color: 1710618 }), "#d4af37"), C = e({ dice: {
	shapes: [x],
	materials: [S]
} });
//#endregion
export { C as default };
