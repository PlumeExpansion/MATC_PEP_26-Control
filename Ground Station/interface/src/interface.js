import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

export class Interface {
	onTelem = [];
	onRender = [];
	constructor(dm) {
		this.dm = dm;

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
		
		this.renderloop = this.renderloop.bind(this);
		window.requestAnimationFrame((nowMS) => {
			this.lastMs = nowMS
			window.requestAnimationFrame(this.renderloop);
		});
	}
	renderloop(nowMs) {
		const dt = (nowMs - this.lastMs)/1000;
		this.lastMs = nowMs;
		try {
			this.renderer.render(this.scene, this.camera);
		} catch (error) {
			console.error("ERROR: render error:", error);
		}
		window.requestAnimationFrame(this.renderloop);
		this.onRender.forEach(callback => callback(nowMs,dt));
	};
}