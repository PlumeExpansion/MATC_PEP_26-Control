import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";

import { Waterplane } from "./waterplane.js";
import * as utils from './utils.js';

export class Visualizer {
	camFollowTimeConstant = 0.5;
	onTelem = [];
	onRender = [];
	constructor(dm) {
		this.dm = dm;
		this.syncFlag = true;

		// --- Main Setup ---
		this.canvas = document.querySelector("canvas.threejs");
		this.renderer = new THREE.WebGLRenderer({canvas: this.canvas, antialias: true,});
		this.renderer.setSize(window.innerWidth, window.innerHeight);
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

		this.scene = new THREE.Scene();
		this.camera = new THREE.PerspectiveCamera(35, window.innerWidth/window.innerHeight, 0.1, 2000);
		this.camera.defaultPosition = new THREE.Vector3(5, -3, -2);
		this.camera.position.copy(this.camera.defaultPosition);
		this.camera.up = new THREE.Vector3(0,0,-1);
		
		window.addEventListener('resize', () => {
			this.camera.aspect = window.innerWidth / window.innerHeight;
			this.camera.updateProjectionMatrix()
			this.renderer.setSize(window.innerWidth, window.innerHeight);
		});

		this.controls = new OrbitControls(this.camera, this.canvas);
		this.controls.enableDamping = true;
		this.controls.zoomSpeed = 2;
		this.controls.zoomToCursor = true;

		// --- Scene Setup ---
		this.waterplane = new Waterplane(this.dm.sceneConfig, 20, 20, 2);
		this.scene.add(this.waterplane);
		dm.callbacks.onToggleGrid = () => this.waterplane.toggleGrid();
		dm.callbacks.onToggleWaterplane = () => this.waterplane.toggleWaterplane();
		
		// -- Lights -- 
		this.ambientLight = new THREE.AmbientLight('white', 0.05);
		this.topLight = new THREE.DirectionalLight('white', 1.5);
		this.bottomLight = new THREE.DirectionalLight('white', 0.2);
		this.topLight.position.set(2,-2,-2);
		this.bottomLight.position.set(-2,2,2);
		this.scene.add(this.ambientLight, this.topLight, this.bottomLight);
		this.topLightHelper = new THREE.DirectionalLightHelper(this.topLight, 0.5);
		this.bottomLightHelper = new THREE.DirectionalLightHelper(this.bottomLight, 0.5);
		this.scene.add(this.topLightHelper, this.bottomLightHelper);
		
		dm.callbacks.onToggleLightHelpers = () => {
			this.topLightHelper.visible = !this.topLightHelper.visible;
			this.bottomLightHelper.visible = !this.bottomLightHelper.visible;
		};
		dm.callbacks.onRefocusCamera = () => {
			const target = new THREE.Vector3(dm.simStates.r.x, dm.simStates.r.y, dm.simStates.r.z/100)
			this.camera.position.copy(target).add(this.camera.defaultPosition);
			this.camera.lookAt(target);
			this.controls.target.copy(target);
			this.controls.update();
		}

		// -- Groups --
		this.bodyGroup = new THREE.Group();
		this.raGroup = new THREE.Group();
		this.bodyGroup.add(this.raGroup);
		this.bodyGroup.oldPos = new THREE.Vector3();
		this.scene.add(this.bodyGroup);

		// -- Coordinate Frames --
		this.fixedFrame = new utils.Axes();
		this.scene.add(this.fixedFrame);
		this.bodyFrame = new utils.Axes();
		this.bodyGroup.add(this.bodyFrame);
		this.rearAxleFrame = new utils.Axes();
		this.raGroup.add(this.rearAxleFrame);

		dm.callbacks.onToggleFixedFrame = () => this.fixedFrame.visible = !this.fixedFrame.visible;
		dm.callbacks.onToggleBodyFrame = () => this.bodyFrame.visible = !this.bodyFrame.visible;
		dm.callbacks.onToggleRearAxleFrame = () => this.rearAxleFrame.visible = !this.rearAxleFrame.visible;

		// --- Model Setup ---
		this.panels = new Map();
		this.wingRoots = new Map([
			['L', new WingRoot(dm.sceneConfig)],
			['R', new WingRoot(dm.sceneConfig)]
		]);
		this.#initSTL();
		this.#loadSTL();
		this.hull = new Hull(dm.sceneConfig);
		this.propulsor = new Propulsor(dm.sceneConfig);
		this.bodyGroup.add(this.hull, this.wingRoots.get('L'), this.wingRoots.get('R'));
		this.raGroup.add(this.propulsor);
		this.components = [this.hull, this.propulsor, this.wingRoots.get('L'), this.wingRoots.get('R')];

		dm.callbacks.onToggleHullAxes = () => this.hull.toggleAxes();
		dm.callbacks.onToggleFoilAxes = () => {
			this.panels.forEach(panel => panel.toggleAxes());
			this.wingRoots.values().forEach(wr => wr.toggleAxes());
		}
		dm.callbacks.onTogglePropulsorAxes = () => this.propulsor.toggleAxes();
		dm.callbacks.onVisuals = () => this.components.forEach(c => c.syncVisuals());
		dm.callbacks.onWaterplaneVisuals = () => this.waterplane.syncVisuals();
		dm.callbacks.onToggleForces = () => this.components.forEach(c => c.toggleForces());
		dm.callbacks.onToggleMoments = () => this.components.forEach(c => c.toggleMoments());
		dm.callbacks.onToggleSubmerged = () => this.panels.forEach(p => p.toggleSubmerged());
		dm.callbacks.onToggleSurfaced = () => this.panels.forEach(p => p.toggleSurfaced());
		dm.callbacks.onToggleSubmergence = () => {
			this.panels.forEach(p => p.toggleSubmergence());
			this.propulsor.toggleSubmergence();
		};
	}
	async #initSTL() {
		this.bufferGeom = new THREE.BufferGeometry();

		this.stlMaterial = new THREE.MeshPhongMaterial({ transparent: true });
		this.buoyMaterial = new THREE.MeshPhongMaterial();
		
		this.hullMesh = new THREE.Mesh(this.bufferGeom, this.stlMaterial);
		this.wingMesh = new THREE.Mesh(this.bufferGeom, this.stlMaterial);
		this.rearWingMesh = new THREE.Mesh(this.bufferGeom, this.stlMaterial);
		this.motorMesh = new THREE.Mesh(this.bufferGeom, this.stlMaterial);
		this.propMesh = new THREE.Mesh(new THREE.BufferGeometry(), this.stlMaterial);
	}
	async #loadSTL() {
		this.loader = new STLLoader();
		this.hullGeometry = await this.loader.loadAsync('RBird_Hull_Remesh.stl');
		// this.wingGeometry = await this.loader.loadAsync('Wing_Applied_Low_Poly.stl');
		this.wingGeometry = await this.loader.loadAsync('Wing_Extended_Applied_Low_Poly.stl');
		// this.rearWingGeometry = await this.loader.loadAsync('Rear_Extended_Applied_Low_Poly_RA_Origin.stl');
		this.rearWingGeometry = await this.loader.loadAsync('Rear_Wing_Extended_Applied_Low_Poly_RA_Origin.stl');
		this.buoyGeometry = await this.loader.loadAsync('Buoy.stl');
		this.motorGeometry = await this.loader.loadAsync('Low_Poly_FlipSky-85165-150.stl');
		
		this.bufferGeom.dispose();
		this.hullMesh.geometry = this.hullGeometry;
		this.wingMesh.geometry = this.wingGeometry;
		this.rearWingMesh.geometry = this.rearWingGeometry;
		this.motorMesh.geometry = this.motorGeometry;

		this.buoys = []
		this.nearBuoyMesh = new THREE.Mesh(this.buoyGeometry, this.buoyMaterial);
		this.farBuoyMesh = new THREE.Mesh(this.buoyGeometry, this.buoyMaterial);
		this.targetBuoy = this.farBuoyMesh;
		for (let i=0; i<this.dm.sceneConfig.maxBuoyTrailCount; i++) {
			const buoy = new THREE.Mesh(this.buoyGeometry, this.buoyMaterial);
			this.buoys.push(buoy);
			this.scene.add(buoy);
		}
		this.motorMesh.rotateZ(-Math.PI/2);
		this.propMesh.rotateY(Math.PI/2);

		this.bodyGroup.renderOrder = 2;
		this.raGroup.renderOrder = 1;
		
		this.bodyGroup.add(this.hullMesh, this.wingMesh);
		this.raGroup.add(this.rearWingMesh, this.motorMesh, this.propMesh);
		this.scene.add(this.nearBuoyMesh, this.farBuoyMesh);
		this.dm.callbacks.onToggleHull = () => this.hullMesh.visible = !this.hullMesh.visible;
		this.dm.callbacks.onToggleWings = () => this.wingMesh.visible = !this.wingMesh.visible;
		this.dm.callbacks.onToggleRearWings = () => this.rearWingMesh.visible = !this.rearWingMesh.visible;
		this.dm.callbacks.onStlVisuals = () => {
			this.stlMaterial.opacity = this.dm.sceneConfig.stlOpacity;
			this.stlMaterial.color.set(this.dm.sceneConfig.stlColor);
		};
		this.dm.callbacks.onStlVisuals();

		this.dm.callbacks.onBuoyVisuals = () => {
			this.nearBuoyMesh.scale.setScalar(this.dm.sceneConfig.buoyScale);
			this.farBuoyMesh.scale.setScalar(this.dm.sceneConfig.buoyScale);
			this.buoys.forEach(b => b.scale.setScalar(this.dm.sceneConfig.buoyScale));
			this.buoyMaterial.color.set(this.dm.sceneConfig.buoyColor);
			this.buoyMaterial.emissive.set(this.dm.sceneConfig.buoyColor);
		}
		this.dm.callbacks.onBuoyTrail = () => {
			if (!this.nearBuoyMesh.visible) return;
			this.buoyDelta = new THREE.Vector3().copy(this.farBuoyMesh.position).sub(this.nearBuoyMesh.position)
				.divideScalar(this.dm.sceneConfig.buoyTrailCount+1);
			for (let i=0; i<this.dm.sceneConfig.maxBuoyTrailCount; i++) {
				const buoy = this.buoys[i];
				if (i < this.dm.sceneConfig.buoyTrailCount) {
					buoy.position.copy(this.buoyDelta).multiplyScalar(i+1).add(this.nearBuoyMesh.position);
					buoy.visible = true;
				} else {
					buoy.visible = false;
				}
			}
		}
		this.dm.callbacks.onToggleBuoys = () => {
			this.nearBuoyMesh.visible = !this.nearBuoyMesh.visible;
			this.farBuoyMesh.visible = !this.farBuoyMesh.visible;
			this.buoys.forEach(b => b.visible = !b.visible);
		}
		this.dm.callbacks.onBuoyPos = (buoy, pos) => {
			(buoy == 'Near'? this.nearBuoyMesh : this.farBuoyMesh).position.set(pos.x, pos.y, 0);
			this.dm.callbacks.onBuoyTrail();
		}
		this.dm.callbacks.onBuoyPos('Near', this.dm.sceneConfig.nearBuoyPos);
		this.dm.callbacks.onBuoyPos('Far', this.dm.sceneConfig.farBuoyPos);
		this.dm.callbacks.onBuoyVisuals();
		
		this.renderloop = this.renderloop.bind(this);
		window.requestAnimationFrame((nowMS) => {
			this.lastMs = nowMS
			window.requestAnimationFrame(this.renderloop);
		});
	}
	async buildPropeller() {
		this.propMesh.geometry.dispose();
		this.propGeometry = await this.loader.loadAsync(
			`Propeller/Low_Poly_B4-70-14_${Math.round(this.propulsor.d*100)}.stl`);
		this.propMesh.geometry = this.propGeometry;
	}
	flashBuoy() {
		if (this.buoyMaterial) {
			const intensity = 4 + 4*Math.sin(new Date()/1000*(2*Math.PI)*this.dm.sceneConfig.buoyFlashRate);
			this.buoyMaterial.emissiveIntensity = intensity;
		}
	}
	rotateProp(dt) {
		const rot = dt*this.dm.simStates.RPM/60*(2*Math.PI)*this.dm.simStates.rate;
		if (!isNaN(rot)) this.propMesh.rotateZ(rot);
	}
	renderloop(nowMs) {
		const dt = (nowMs - this.lastMs)/1000;
		this.lastMs = nowMs;
		const track = this.dm.sceneConfig.cameraTrack;
		this.controls.zoomToCursor = track == 'None';
		if (track != 'None') {
			let target;
			if (track == 'Body') target = this.bodyGroup.position.clone();
			else {
				target = this.targetBuoy.position.clone();
				const bodyDist = target.distanceTo(this.bodyGroup.position);
				const camDist = target.distanceTo(this.camera.position);
				const scaleDist = camDist-bodyDist;
				const camToTargetDir = new THREE.Vector3().copy(target).sub(this.camera.position).normalize();
				const camToBodyDir = new THREE.Vector3().copy(this.bodyGroup.position).sub(this.camera.position).normalize()
				if (scaleDist > 1 && camToBodyDir.dot(camToTargetDir) > 0.8)
					// target.sub(this.camera.position).normalize().multiplyScalar(scaleDist).add(this.camera.position)
					target = new THREE.Vector3().copy(camToBodyDir).add(camToTargetDir)
						.multiplyScalar(scaleDist/2).add(this.camera.position);
			}

			const frac = Math.exp(-dt/this.camFollowTimeConstant);
			this.controls.target.multiplyScalar(frac).add(target.multiplyScalar(1-frac));
		}
		this.controls.update();
		this.flashBuoy();
		this.rotateProp(dt);
		try {
			this.renderer.render(this.scene, this.camera);
		} catch (error) {
			console.error("ERROR: render error:", error);
		}
		window.requestAnimationFrame(this.renderloop);
		this.onRender.forEach(callback => callback(dt));
	};
	build(msg) {
		this.raGroup.position.copy(this.dm.constants.r_ra);

		this.hullMesh.position.copy(this.dm.constants.r_CM).multiplyScalar(-1);
		this.wingMesh.position.copy(this.dm.constants.r_CM).multiplyScalar(-1);

		this.panels.values().forEach(panel => panel.dispose());
		this.components.splice(4, this.panels.values().length);
		this.panels.clear();
		for (const id in msg['panels']) {
			const data = msg['panels'][id];
			const panel = new Panel(id, this.dm.sceneConfig);
			panel.build(data);
			this.panels.set(id, panel);
			this.components.push(panel);
			if (panel.rear)
				this.raGroup.add(panel);
			else
				this.bodyGroup.add(panel);
		}
		this.hull.build(msg['hull']);
		this.propulsor.build(msg['propulsor']);

		this.motorMesh.position.copy(this.propulsor.r_motor);
		this.propMesh.position.copy(this.propulsor.r_prop);

		console.log('INFO: build successful');
		this.syncFlag = true;
	}
	telem(msg) {
		this.bodyGroup.oldPos.copy(this.bodyGroup.position)
		this.bodyGroup.setRotationFromMatrix(new THREE.Matrix4().setFromMatrix3(this.dm.states.C0b));
		this.bodyGroup.position.copy(this.dm.states.r);

		this.raGroup.setRotationFromMatrix(new THREE.Matrix4().setFromMatrix3(this.dm.states.Cb_ra));

		for (const id in msg['panels']) this.panels.get(id).syncTelem(msg['panels'][id], this.dm.states.Cra_b);
		for (const id in msg['wing_roots']) this.wingRoots.get(id).syncTelem(msg['wing_roots'][id]);
		this.hull.syncTelem(msg['hull']);
		this.propulsor.syncTelem(msg['propulsor'], this.dm.states.Cra_b);
		
		this.dm.simStates.V = this.propulsor.V;
		this.dm.simStates.I = this.propulsor.I;
		this.dm.simStates.RPM = this.propulsor.n*60;
		this.dm.simStates.rate = msg['rate'];
		this.dm.simStates.method = msg['method'];
		this.dm.setMethod(msg['method'])
		this.dm.updateSimulationStatus(msg['running']);
		
		if (this.syncFlag) {
			this.dm.syncControlStates();
			this.dm.syncInputs();
			this.syncFlag = false;
		}

		switch (this.dm.sceneConfig.cameraMode) {
			case 'Lock':
				const angle = this.dm.simStates.deltaPsi*Math.PI/180;
				const matrix = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0,0,angle))
				const delta = this.camera.position.clone().sub(this.controls.target).applyMatrix4(matrix);
				this.camera.position.copy(this.controls.target).add(delta);
			case 'Follow':
				this.bodyGroup.oldPos.sub(this.bodyGroup.position);
				this.camera.position.sub(this.bodyGroup.oldPos);
				this.controls.target.sub(this.bodyGroup.oldPos);
		}

		this.waterplane.updateGrid(this.dm.states.r);
		this.components.forEach(c => c.syncVisuals());
		this.waterplane.syncVisuals();

		this.onTelem.forEach(callback => callback());
	}
}