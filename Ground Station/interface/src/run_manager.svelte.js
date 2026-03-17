import * as THREE from 'three';
import { mkConfig, generateCsv, download } from 'export-to-csv';

export class RunManager {
	elapsed = $state(0);
	inProgress = $state(false);
	usage = $state(0);
	up = new THREE.Vector3(0,0,-1);
	offsetDist = 3;
	backDist = 5;
	constructor(dm,viz) {
		this.dm = dm;
		this.viz = viz;
		this.log = [];
		viz.onRender.push(() => this.update());
		viz.onTelem.push(() => this.#updateLog());
	}
	onToggleRun() {
		this.inProgress = !this.inProgress;
		if (this.inProgress) {
			this.viz.targetBuoy = this.viz.farBuoyMesh;
			this.startTime = this.dm.simStates.time;
			this.lastUpdated = this.dm.simStates.time;
			this.elapsed = 0;
			this.turns = 0;
			this.lastCriterion = this.#getCriterion();
			this.usage = 0;
			this.log = [];
		}
	}
	onExportRun() {
		const headers = Object.keys(this.log[0]);
		const csvConfig = mkConfig({ 
			columnHeaders: headers, 
			useKeyAsHeaders: true, 
			filename: `run_${(new Date()).toLocaleString()}` })
		const csvOutput = generateCsv(csvConfig)(this.log);
		download(csvConfig)(csvOutput);
	}
	#updateLog() {
		if (!this.inProgress) return;
		const raForce = new THREE.Vector3();
		const leftForce = new THREE.Vector3();
		const rightForce = new THREE.Vector3();
		const raMoment = new THREE.Vector3();
		const leftMoment = new THREE.Vector3();
		const rightMoment = new THREE.Vector3();
		this.viz.panels.forEach((panel,id) => {
			if (panel.rear) {
				raForce.add(panel.F)
				raMoment.add(panel.M);
			} else {
				if (id.includes('L')) {
					leftForce.add(panel.F);
					leftMoment.add(panel.M);
				} else {
					rightForce.add(panel.F);
					rightMoment.add(panel.M);
				}
			}
		});
		raForce.add(this.viz.propulsor.F);
		raMoment.add(this.viz.propulsor.M);
		raMoment.sub(new THREE.Vector3().copy(this.dm.constants.r_ra).cross(raForce));
		const leftWingRoot = this.viz.wingRoots.get('L');
		const rightWingRoot = this.viz.wingRoots.get('R');
		leftForce.add(leftWingRoot.F_f).add(leftWingRoot.F_b);
		leftMoment.add(leftWingRoot.M_f).add(leftWingRoot.M_b);
		leftMoment.sub(new THREE.Vector3().copy(leftWingRoot.r_qc_r).cross(leftForce));
		rightForce.add(rightWingRoot.F_f).add(rightWingRoot.F_b);
		rightMoment.add(rightWingRoot.M_f).add(rightWingRoot.M_b);
		rightMoment.sub(new THREE.Vector3().copy(rightWingRoot.r_qc_r).cross(rightForce));
		const entry = {
			time: this.dm.simStates.time,
			// inputs
			V: this.dm.simStates.V,
			psi_ra: this.dm.simStates.psi_ra,
			// propulsor
			I: this.dm.simStates.I,
			RPM: this.dm.simStates.RPM,
			P: this.dm.simStates.I*this.dm.simStates.V,
			Ah: this.usage,
			Q: this.viz.propulsor.Q,
			// hull
			vol: this.viz.hull.vol,
			// forces
			raFx: raForce.x,
			raFy: raForce.y,
			raFz: raForce.z,
			leftFx: leftForce.x,
			leftFy: leftForce.y,
			leftFz: leftForce.z,
			rightFx: rightForce.x,
			rightFy: rightForce.y,
			rightFz: rightForce.z,
			// moments
			raMx: raMoment.x,
			raMy: raMoment.y,
			raMz: raMoment.z,
			leftMx: leftMoment.x,
			leftMy: leftMoment.y,
			leftMz: leftMoment.z,
			rightMx: rightMoment.x,
			rightMy: rightMoment.y,
			rightMz: rightMoment.z,
			// states
			u: this.dm.simStates.U.u,
			v: this.dm.simStates.U.v,
			w: this.dm.simStates.U.w,
			p: this.dm.simStates.omega.p,
			q: this.dm.simStates.omega.q,
			r: this.dm.simStates.omega.r,
			phi: this.dm.simStates.Phi.phi,
			theta: this.dm.simStates.Phi.theta,
			psi: this.dm.simStates.Phi.psi,
			x: this.dm.simStates.r.x,
			y: this.dm.simStates.r.y,
			z: this.dm.simStates.r.z,
		}
		this.log.push(entry);
	}
	onPos(pos) {
		const dir = new THREE.Vector3().copy(this.viz.farBuoyMesh.position).sub(this.viz.nearBuoyMesh.position).normalize();
		const rot = Math.atan2(-dir.y, dir.x);
		const offset = new THREE.Vector3().copy(dir).cross(this.up);
		if (pos.includes('Left')) offset.multiplyScalar(-1);
		offset.multiplyScalar(this.offsetDist).sub(dir.clone().multiplyScalar(this.backDist));
		{
			this.dm.controlStates.r.x = offset.x + this.viz.nearBuoyMesh.position.x;
			this.dm.controlStates.r.y = offset.y + this.viz.nearBuoyMesh.position.y;
			this.dm.callbacks.onStateChange('r', { origin: 'internal', value: this.dm.controlStates.r });
			this.dm.controlStates.Phi.z = Math.PI/2 - rot*180/Math.PI;
			this.dm.callbacks.onStateChange('Phi', { origin: 'internal', value: this.dm.controlStates.Phi });
		}
	}
	#getCurrentDir() {
		return new THREE.Vector3().copy(this.viz.targetBuoy.position)
			.sub((this.viz.targetBuoy == this.viz.nearBuoyMesh? this.viz.farBuoyMesh : this.viz.nearBuoyMesh).position).normalize();
	}
	#getToBodyVec() {
		return new THREE.Vector3().copy(this.viz.bodyGroup.position).sub(this.viz.targetBuoy.position);
	}
	#getCriterion() {
		const dir = this.#getCurrentDir();
		const toBodyDir = this.#getToBodyVec().normalize();
		return toBodyDir.dot(dir);
	}
	update() {
		if (!this.inProgress) return;
		this.elapsed = this.dm.simStates.time - this.startTime;
		this.dt = this.dm.simStates.time-this.lastUpdated;
		this.lastUpdated = this.dm.simStates.time;
		this.usage += this.dt*this.dm.simStates.V*this.dm.simStates.I/3600/this.dm.constants.V_max;
		const criterion = this.#getCriterion();
		let toBodyVec = this.#getToBodyVec();
		if (criterion > 0 && this.lastCriterion <= 0) {
			this.viz.targetBuoy = this.viz.targetBuoy == this.viz.nearBuoyMesh? this.viz.farBuoyMesh : this.viz.nearBuoyMesh;
			this.turns++;
			if (this.turns == 4) this.onToggleRun();
		}
		if (this.dm.sceneConfig.cameraTrack == 'Buoy' && toBodyVec.lengthSq() < this.viz.buoyDelta.lengthSq()) {
			const camZ = this.viz.camera.position.z;
			const bodyToCam = new THREE.Vector3().copy(this.viz.camera.position).sub(this.viz.bodyGroup.position).setComponent(2,0);
			toBodyVec = this.#getToBodyVec().setComponent(2,0).normalize().multiplyScalar(bodyToCam.length());
			toBodyVec.z = camZ;
			this.viz.camera.position.copy(this.viz.bodyGroup.position).setComponent(2,0).add(toBodyVec);
		}
		this.lastCriterion = criterion;
	}
}