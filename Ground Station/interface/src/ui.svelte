<script lang='ts'>
	import { Pane, Folder, Binding, Monitor, Button, Slider, Color, Point,
		List, ButtonGrid, type ButtonGridClickEvent, RadioGrid} from 'svelte-tweakpane-ui'
	import { DataManager } from './data_manager.svelte.js';
	import { RunManager } from './run_manager.svelte.js';

	let { dm, rm }: { dm: DataManager, rm: RunManager } = $props();

	let isDisconnected = $derived(dm.socketParams.status == 'Disconnected');
	let isConnected = $derived(dm.socketParams.status == 'Connected');
	let connectBtnTitle = $derived(isConnected? 'Connected' : 'Connect');
</script>

<Pane title='Controls' x={0} y={0} width={256} localStoreId='leftPane'>
	<Folder title='Websocket'>
		<Binding bind:object={dm.socketParams} key='url' label='address' />
		<Monitor value={dm.socketParams.status} label='status' />
		<Button on:click={() => dm.callbacks.onConnect(dm.socketParams.url)} 
			title={connectBtnTitle}
			disabled={!isDisconnected} />
	</Folder>
	<!-- <Folder title='Run' disabled={!isConnected}>
		<Monitor value={rm.elapsed} label='elapsed [s]' format={v => v.toFixed(2)} />
		<Monitor value={rm.usage} label='usage [Ah]' format={v => v.toFixed(2)} />
		<ButtonGrid on:click={(ev) => {
			if (ev.detail.label == 'Export') rm.onExportRun();
			else rm.onToggleRun();
		}} buttons={rm.inProgress? ['End Run','Export'] : ['Start Run','Export']} rows={1} />
		<ButtonGrid on:click={ev => rm.onPos(ev.detail.label)} buttons={['Set Left','Set Right']}  rows={1} disabled={rm.inProgress} />
	</Folder>
	<Folder title='Camera'>
		<Button on:click={() => dm.callbacks.onRefocusCamera()}  title='Refocus Camera' />
		<RadioGrid bind:value={dm.sceneConfig.cameraMode} values={['Free','Follow','Lock']}  rows={1} />
		<Folder title='Track'>
			<RadioGrid bind:value={dm.sceneConfig.cameraTrack} values={['None','Body','Buoy']}  rows={1} />
		</Folder>
	</Folder> -->
</Pane>
<Pane title='Visuals' x={270} y={0} width={270} localStoreId='midPane' expanded={false}>
	<Folder title='Scene'>
		<ButtonGrid on:click={ev => {
			switch (ev.detail.label) {
				case 'Lighting':
					dm.callbacks.onToggleLightHelpers();
					break;
				case 'Buoys':
					dm.callbacks.onToggleBuoys();
					break;
			}
		}} buttons={['Lighting','Buoys']} rows={1} />
		<Folder title='STL'>
			<Color bind:value={dm.sceneConfig.stlColor} label='color' on:change={() => dm.callbacks.onStlVisuals()} />
			<Slider bind:value={dm.sceneConfig.stlOpacity} 
				min={0} max={1} format={v => v.toFixed(1)} label='opacity' on:change={() => dm.callbacks.onStlVisuals()}/>
			<ButtonGrid on:click={ev => {
				switch (ev.detail.label) {
					case 'Hull':
						dm.callbacks.onToggleHull();
						break;
					case 'Wings':
						dm.callbacks.onToggleWings();
						break;
					case 'Rear Wings':
						dm.callbacks.onToggleRearWings();
						break;
				}
			}} buttons={['Hull','Wings','Rear Wings']} rows={1} />
		</Folder>
		<Folder title='Waterplane'>
			<Color bind:value={dm.sceneConfig.waterplaneColor} label='color' on:change={() => dm.callbacks.onWaterplaneVisuals()} />
			<Slider bind:value={dm.sceneConfig.waterplaneOpacity} 
				min={0} max={1} format={v => v.toFixed(1)} label='opacity' on:change={() => dm.callbacks.onWaterplaneVisuals()}/>
			<ButtonGrid on:click={ev => {
				switch (ev.detail.label) {
					case 'Waterplane':
						dm.callbacks.onToggleWaterplane();
						break;
					case 'Grid':
						dm.callbacks.onToggleGrid();
						break;
				}
			}} buttons={['Waterplane','Grid']} rows={1} />
		</Folder>
		<Folder title='Buoy'>
			<Color bind:value={dm.sceneConfig.buoyColor} label='color' on:change={() => dm.callbacks.onBuoyVisuals()} />
			<Slider bind:value={dm.sceneConfig.buoyScale} 
				min={0} max={2} format={v => v.toFixed(1)} label='scale' on:change={() => dm.callbacks.onBuoyVisuals()}/>
			<Slider bind:value={dm.sceneConfig.buoyFlashRate} 
				min={0} max={1} format={v => v.toFixed(1)} label='rate' on:change={() => dm.callbacks.onBuoyVisuals()}/>
			<Slider bind:value={dm.sceneConfig.buoyTrailCount} step={1}
				min={0} max={dm.sceneConfig.maxBuoyTrailCount} format={v => v.toFixed(0)} label='trail' on:change={() => dm.callbacks.onBuoyTrail()}/>
			<Point bind:value={dm.sceneConfig.nearBuoyPos} label='<x,y>'
				optionsX={{min: -1000, max: 1000}}
				optionsY={{min: -1000, max: 1000}}
				on:change={(ev) => dm.callbacks.onBuoyPos('Near', ev.detail.value)}
				format={v => v.toFixed(2)}
				pointerScale={0.1}/>
			<Point bind:value={dm.sceneConfig.farBuoyPos} label='<x,y>'
				optionsX={{min: -1000, max: 1000}}
				optionsY={{min: -1000, max: 1000}}
				on:change={(ev) => dm.callbacks.onBuoyPos('Far', ev.detail.value)}
				format={v => v.toFixed(2)}
				pointerScale={0.1}/>
			<Button title='Reset Position' on:click={() => {
				dm.sceneConfig.nearBuoyPos = { x: 10, y: -10 };
				dm.sceneConfig.farBuoyPos = { x: 10, y: -815 };
			}} />
		</Folder>
	</Folder>
</Pane>

<Pane title='States' x={window.innerWidth} y={0} width={270} localStoreId='rightPane'>
	<!-- <Button on:click={() => {
		ui.syncControlStates();
		ui.syncInputs();
	}}  title='Sync States' /> -->
	<Button on:click={() => dm.callbacks.onReset()}  title='Zero States' />
	<Folder title='Velocites'>
		<Monitor value={dm.usvStates.U.u} label='u [m/s]' />
		<Monitor value={dm.usvStates.U.v} label='v [m/s]' />
		<Monitor value={dm.usvStates.U.w} label='w [m/s]' />
		<!-- <Point bind:value={dm.controlStates.U} label='<u,v,w>' 
			optionsX={{min: -5, max: 20}}
			optionsY={{min: -2, max: 2}}
			optionsZ={{min: -2, max: 2}} 
			on:change={ev => dm.callbacks.onStateChange('U', ev.detail)}
			disabled={dm.usvStates.running}
			format={v => v.toFixed(2)}/> -->
	</Folder>
	<Folder title='Angular Rates'>
		<Monitor value={dm.usvStates.omega.p} label='p [°/s]' />
		<Monitor value={dm.usvStates.omega.q} label='q [°/s]' />
		<Monitor value={dm.usvStates.omega.r} label='r [°/s]' />
		<!-- <Point bind:value={dm.controlStates.omega} label='<p,q,r>' 
			optionsX={{min: -60, max: 60}}
			optionsY={{min: -60, max: 60}}
			optionsZ={{min: -60, max: 60}} 
			on:change={ev => dm.callbacks.onStateChange('omega', ev.detail)}
			disabled={dm.usvStates.running}
			format={v => v.toFixed(2)}/> -->
	</Folder>
	<Folder title='Euler Angles'>
		<Monitor value={dm.usvStates.Phi.phi} label='ϕ [°]' />
		<Monitor value={dm.usvStates.Phi.theta} label='θ [°]' />
		<Monitor value={dm.usvStates.Phi.psi} label='ψ [°]' />
		<!-- <Point bind:value={dm.controlStates.Phi} label='<ϕ,θ,ψ>' 
			optionsX={{min: -60, max: 60}}
			optionsY={{min: -45, max: 45}}
			optionsZ={{min: -180, max: 180}}
			on:change={ev => dm.callbacks.onStateChange('Phi', ev.detail)}
			disabled={dm.usvStates.running}
			format={v => v.toFixed(2)}/> -->
	</Folder>
	<Folder title='Position'>
		<Monitor value={dm.usvStates.r.x} label='x [m]' />
		<Monitor value={dm.usvStates.r.y} label='y [m]' />
		<Monitor value={dm.usvStates.r.z} label='z [cm]' />
		<!-- <Point bind:value={dm.controlStates.r} label='<x,y,z>' 
			optionsZ={{min: -50, max: 50}} 
			on:change={ev => dm.callbacks.onStateChange('r', ev.detail)}
			disabled={dm.usvStates.running}
			format={v => v.toFixed(1)}/> -->
	</Folder>
	<Folder title='Propulsor States'>
		<Button on:click={() => {
			dm.controlStates.input.x = 0;
			dm.controlStates.input.y = 0;
			dm.callbacks.onInput({ value: dm.controlStates.input, origin: 'internal' })
		}}  title='Zero Inputs' />
		<Monitor value={dm.usvStates.RPM} label='RPM' />
		<Monitor value={dm.usvStates.I} label='I [A]' />
		<Monitor value={dm.usvStates.psi_ra} label='ψ-ra [°]' />
		<Monitor value={dm.usvStates.V} label='V [V]' />
		<Point bind:value={dm.controlStates.input} label='<%ψ,%V>' 
			optionsX={{min: -1, max: 1}}
			optionsY={{min: -1, max: 1, inverted: true}}
			picker='inline'
			expanded={true}
			on:change={ev => dm.callbacks.onInput(ev.detail)}
			format={v => v.toFixed(2)}/>
	</Folder>
</Pane>