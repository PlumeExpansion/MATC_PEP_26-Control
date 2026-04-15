import { mkConfig, generateCsv, download } from 'export-to-csv';

export class DataManager {
	socketParams = $state({
		url: 'ws://localhost:9100',
		status: 'Disconnected'
	});
	cmds = $state({
		input: {x: 0, y: 0},
		cooling: 0,
		bilge: 0,
		main: false,
		aux: false,
	});
	telem = $state({
		ESC: {
			motorCurrent: 0,
			inputCurrent: 0,
			dutyCycleNow: 0,
			eRPM: 0,
			inputVoltage: 0,
			wattHours: 0,
			tempMofset: 0,
			tempMotor: 0,
		},
		throttle: 0,
		steering: 0,
		mainEnable: false,
		auxEnable: false,
		mainEcho: false,
		gsLinkActive: false,
		gpsLinkActive: false,
		escLinkActive: false,
		controlledContactor: false,
		time: 0,

		GPS: {
			latDeg: 0,
			lonDeg: 0,
			alt: 0,
			speed: 0,
			angle: 0,
			HDOP: 0,
			VDOP: 0,
			satellites: 0,
			fixQuality: 0,
		},

		usvLinkActive: false,
		rssi: 0,
	});
	callbacks = {};
	throttle_params = {
		x0: 0.4,
		y0: 0.3,
	};
	steering_params = {
		x0: 0.25,
		y0: 0.1
	};
	log = []
	constructor() {
		this.throttle_params.coeffs = this.#getMappingParameters(this.throttle_params.x0, this.throttle_params.y0);
		this.steering_params.coeffs = this.#getMappingParameters(this.steering_params.x0, this.steering_params.y0);
	}
	updateSocketStatus(status) {
		this.socketParams.status = status;
	}
	#getMappingParameters(x0,y0) {
		// Piecewise Linear Cubic
		const A = (y0-x0)/(x0*(x0-1)**3);
		const B = 3*(x0-y0)/(x0-1)**3;
		const C = ((y0-3)*x0**3-y0+3*x0*y0)/(x0*(x0-1)**3);
		const D = ((x0-y0)*x0**2)/(x0-1)**3;
		return [A,B,C,D];
	}
	queryMapped(x,params) {
		const xi = Math.abs(x);
		let y = 0;
		if (xi < params.x0) y = params.y0/params.x0*xi;
		else y = params.coeffs[0]*xi**3 + params.coeffs[1]*xi**2 + params.coeffs[2]*xi + params.coeffs[3];
		return Math.sign(x)*y;
	}
	syncCmds(data) {
		this.cmds.input.y = data['throttle'];
		this.cmds.input.x = data['steering'];
		this.cmds.cooling = data['cooling']/255;
		this.cmds.bilge = data['bilge']/255;
		this.cmds.main = data['main'];
		this.cmds.aux = data['aux'];
	}
	lastTelem = null;
	lastTime = null;
	telemInterval = $state(0);
	telemRate = $state(0);
	syncTelem(data) {
		this.telem.ESC.motorCurrent = data['ESC']['motorCurrent'];
		this.telem.ESC.inputCurrent = data['ESC']['inputCurrent'];
		this.telem.ESC.dutyCycleNow = data['ESC']['dutyCycleNow'];
		this.telem.ESC.eRPM = data['ESC']['eRPM'];
		this.telem.ESC.inputVoltage = data['ESC']['inputVoltage'];
		this.telem.ESC.wattHours = data['ESC']['wattHours'];
		this.telem.ESC.tempMofset = data['ESC']['tempMosfet'];
		this.telem.ESC.tempMotor = data['ESC']['tempMotor'];

		this.telem.throttle = data['throttle'];
		this.telem.steering = data['steering'];
		this.telem.mainEnable = data['mainEnable'];
		this.telem.auxEnable = data['auxEnable'];
		this.telem.mainEcho = data['mainEcho'];
		this.telem.gsLinkActive = data['gsLinkActive'];
		this.telem.escLinkActive = data['escLinkActive'];
		this.telem.gpsLinkActive = data['gpsLinkActive'];
		this.telem.controlledContactor = data['controlledContactor'];
		this.telem.time = data['time'];

		this.telem.GPS.latDeg = data['GPS']['latDeg'];
		this.telem.GPS.lonDeg = data['GPS']['lonDeg'];
		this.telem.GPS.altitude = data['GPS']['alt'];
		this.telem.GPS.speed = data['GPS']['speed'];
		this.telem.GPS.angle = data['GPS']['angle'];
		this.telem.GPS.HDOP = data['GPS']['HDOP'];
		this.telem.GPS.VDOP = data['GPS']['VDOP'];
		this.telem.GPS.satellites = data['GPS']['satellites'];
		this.telem.GPS.fixQuality = data['GPS']['fixQuality'];

		this.telem.usvLinkActive = data['usvLinkActive'];
		this.telem.rssi = data['rssi'];

		if (this.telem.time !== this.lastTime && this.lastTime !== null) {
			const now = performance.now();

			if (this.lastTelem !== null) {
				this.telemInterval = now - this.lastTelem;
				this.telemRate = 1000/(this.telemInterval+1e-4);
			}
			this.lastTelem = now;
			this.nRssi += 1;
			this.sumRssi += this.telem.rssi;
	
			const entry = {
				// ESC Specific Data
				motorCurrent: this.telem.ESC.motorCurrent,
				inputCurrent: this.telem.ESC.inputCurrent,
				dutyCycleNow: this.telem.ESC.dutyCycleNow,
				RPM: this.telem.ESC.eRPM / 5,
				inputVoltage: this.telem.ESC.inputVoltage,
				wattHours: this.telem.ESC.wattHours,
				wattHoursCharged: this.telem.ESC.wattHoursCharged,
				tempMofset: this.telem.ESC.tempMofset,
				tempMotor: this.telem.ESC.tempMotor,
	
				// General Control & Status
				throttle: this.telem.throttle,
				steering: this.telem.steering,
				mainEnable: this.telem.mainEnable,
				auxEnable: this.telem.auxEnable,
				mainEcho: this.telem.mainEcho,
				gsLinkActive: this.telem.gsLinkActive,
				escLinkActive: this.telem.escLinkActive,
				controlledContactor: this.telem.controlledContactor,
				time: this.telem.time,
	
				// Communication Links
				usvLinkActive: this.telem.usvLinkActive,
				rssi: this.telem.rssi,
				telemInterval: this.telemInterval,
				
				// GPS
				latDeg: this.telem.GPS.latDeg,
				lonDeg: this.telem.GPS.lonDeg,
				alt: this.telem.GPS.alt,
				speed: this.telem.GPS.speed,
				angle: this.telem.GPS.angle,
				HDOP: this.telem.GPS.HDOP,
				VDOP: this.telem.GPS.VDOP,
				satellites: this.telem.GPS.satellites,
				fixQuality: this.telem.GPS.fixQuality,

				// Commands
				// throttleCmd: this.cmds.input.y,
				// steeringCmd: this.cmds.input.x,
				cooling: this.cmds.cooling,
				bilge: this.cmds.bilge,
				// mainCmd: this.cmds.main,
				// auxCmd: this.cmds.aux,

				// Additional Quantities
				gsTime: Date.now(),
				elapsed: this.elapsed
			};
			this.log.push(entry);
		}
		this.lastTime = this.telem.time;
	}
	// Data Logging
	elapsed = $state(0);
	inProgress = $state(false);
	startTime;
	onToggleLog() {
		this.inProgress = !this.inProgress;
		if (this.inProgress) {
			this.startTime = performance.now() / 1000;
			this.elapsed = 0;
			this.log = [];
		}
	}

	RSSI_DEL_MS = 200;

	nRssi = 0;
	sumRssi = 0;
	avgRssi = $state(0);
	lastRssi = 0;
	onUpdate = (nowMs,dt) => {
		if (this.inProgress) {
			this.elapsed = nowMs/1000 - this.startTime;
		}
		if (nowMs - this.lastRssi > this.RSSI_DEL_MS) {
			if (this.nRssi == 0) this.avgRssi = 0;
			else this.avgRssi = this.sumRssi/this.nRssi;
			this.sumRssi = 0;
			this.nRssi = 0;
			this.lastRssi = nowMs;
		}
	}

	onExportLog() {
		const headers = Object.keys(this.log[0]);
		const csvConfig = mkConfig({
			columnHeaders: headers, 
			useKeyAsHeaders: true, 
			filename: `log_${(new Date()).toLocaleString()}` })
		const csvOutput = generateCsv(csvConfig)(this.log);
		download(csvConfig)(csvOutput);
	}
}