import asyncio
import websockets
import json
import time
from digi.xbee.devices import XBeeDevice, RemoteXBeeDevice
from digi.xbee.models.address import XBee64BitAddress
import serial.tools.list_ports as list_ports

import os
os.environ['PYGAME_HIDE_SUPPORT_PROMPT'] = '1'
os.environ['PYTHONWARNINGS'] = 'ignore'
import pygame

import USV_states as USVS

# --- USV State Handlers ---
async def null_controls():
	USVS.cmds['throttle'] = 0
	USVS.cmds['steering'] = 0
	print(f'INFO: nulling controls')

async def estop():
	USVS.cmds['throttle'] = 0
	USVS.cmds['steering'] = 0
	USVS.cmds['cooling'] = 0
	USVS.cmds['bilge'] = 0
	USVS.cmds['aux'] = False
	USVS.cmds['main'] = False
	print(f'INFO: emergency stop, cutting all power')

async def reset_flags():
	device.send_data_async(remote_device, USVS.RESET_CMD)
	print(f'INFO: resetting flags')

async def sync_cmds(socket):
	socket.send(json.dumps({'type': 'sync', 'data': USVS.cmds}))

async def sync_telem(socket):
	socket.send(json.dumps({'type': 'telem', 'data': USVS.telem}))

# --- Xbee Link ---
BAUD = 38400
MAC_USV_RN = "0013A20042839427"

sockets = set()

ports = list_ports.comports()
com_list = [p.device for p in ports]
print(f"Select XBee COM port: {com_list}")
PORT = input()

try:
	device = XBeeDevice(PORT, BAUD)
	device.open()
	# device.serial_port.rtscts = True # type: ignore # Enable Flow Control for the Waveshare board
except Exception as e:
	print(f'ERROR: XBee initialization failed - {e}')

remote_addr = XBee64BitAddress.from_hex_string(MAC_USV_RN)
remote_device = RemoteXBeeDevice(device, remote_addr)

last_received = 0
async def on_data_received(xbee_message):
	global last_received
	sender = xbee_message.remote_device.get_64bit_addr()
	if (sender != MAC_USV_RN):
		print(f'WARNING: received from unknown address - {sender}')
		return
	last_received = time.perf_counter()
	rssi_val = device.get_parameter("DB")
	USVS.telem['rssi'] = -int.from_bytes(rssi_val, byteorder="big")
	USVS.unpack_telem(xbee_message.data)
	for socket in sockets: await sync_telem(socket)

device.add_data_received_callback(on_data_received)

# --- Joystick Link ---
pygame.init()
pygame.joystick.init()
controller = None

if pygame.joystick.get_count() == 0:
	print("WARNING: no controller detected")
else:
	try:
		controller = pygame.joystick.Joystick(0)
		controller.init()
		if not controller.get_init():
			print(f'ERROR: controller initialization failed')
		else:
			print(f'INFO: controller linked - "{controller.get_name()}"')
	except Exception as e:
		print(f'ERROR: controller link failed - {e}')

# --- Network Handlers ---
valid_states = ['main','aux','cooling','bilge']
async def handler(socket: websockets.ServerConnection):
	sockets.add(socket)
	print(f'INFO: connected to {socket.remote_address}')
	await sync_cmds(socket)
	await sync_telem(socket)
	try:
		async for message in socket:
			data = json.loads(message)
			try:
				dataType = data['type']
				if dataType == 'set':
					state, value = data['state'], data['value']
					if state in valid_states:
						USVS.cmds[state] = value
					elif state == 'input':
						if (controller is None):
							USVS.cmds['throttle'] = value['y']
							USVS.cmds['steering'] = value['x']
					else: print(f'WARNING: unknown state set request - {state} = {value}')
				elif dataType == 'null':
					await null_controls()
				elif dataType == 'reset':
					await reset_flags()
				elif dataType == 'estop':
					await estop()
				else:
					print(f'WARNING: unknown data received - {data}')
			except Exception as e:
				print(f'ERROR: corrupt data received "{data}" - {e}')
	except websockets.ConnectionClosed:
		pass
	finally:
		sockets.remove(socket)
		print(f'INFO: lost connection to {socket.remote_address}')
		if not sockets: print(f'WARNING: no remaining sockets')

# --- Background Loops ---
last_transmit = 0
async def transmit_loop(transmit_task):
	loop_rate = 100
	transmit_rate = 30
	try:
		while True:
			# broadcast commands
			now = time.perf_counter()
			USVS.telem['usvLinkActive'] = now - last_received < 1
			if now - last_transmit > 1/transmit_rate:
				last_transmit = now
				device.send_data_async(remote_device, USVS.pack_drive())

			await asyncio.sleep(1/loop_rate)
	except asyncio.CancelledError:
		print('INFO: transmit loop terminated')
	except Exception as e:
		print(f'ERROR: transmit error - {e}')
		print(f'INFO: restarting transmit task')
		transmit_task = asyncio.create_task(transmit_loop(transmit_task))

async def console_loop():
	sentinel = ['q', 'quit', 'stop', 'exit']
	steering_sentinel = ['s', 'str', 'steer', 'steering']
	throttle_sentinel = ['t', 'ttl', 'throttle']
	estop_sentinel = ['es', 'estop', 'emergency']
	enable_sentinel = ['on', 'true', 'enable']
	while True:
		cmd = await asyncio.to_thread(input)
		cmd = cmd.lower()
		tokens = cmd.split(' ')
		if cmd in sentinel:
			print('INFO: termination received')
			break
		# console commands
		if cmd == 'null' or cmd == 'n':
			await null_controls()
		if cmd == 'reset' or cmd == 'r':
			await reset_flags()
		elif cmd == 'time':
			print(f'INFO: {'' if USVS.telem['usvLinkActive'] else 'last received '}USV time at {USVS.telem['time']/1000:.3f} second(s)')
		elif cmd == 'status':
			if USVS.telem['usvLinkActive']:
				print(f'INFO: USV link active at signal strength {USVS.telem['rssi']} dBm')
			else:
				print(f'INFO: USV link inactive, last received {int(time.perf_counter() - last_received)} second(s) ago')
		elif cmd in throttle_sentinel:
			print(f'INFO: throttle at {int(100*USVS.telem['echo']['throttle'])}%\ttarget: {int(100*USVS.cmds['throttle'])}%')
		elif cmd in steering_sentinel:
			print(f'INFO: steering at {int(100*USVS.telem['echo']['steering'])}%\ttarget: {int(100*USVS.cmds['steering'])}%')
		elif cmd == 'cooling':
			print(f'INFO: cooling at {int(100*USVS.cmds['cooling']/255)}%')
		elif cmd == 'bilge':
			print(f'INFO: bilge at {int(100*USVS.cmds['bilge']/255)}%')
		elif cmd == 'aux':
			print(f'INFO: auxiliary power {'enabled' if USVS.telem['echo']['aux'] else 'disabled'}\ttarget: {'enabled' if USVS.cmds['aux'] else 'disabled'}')
		elif cmd == 'main':
			print(f'INFO: main power {'enabled' if USVS.telem['echo']['main'] else 'disabled'}\ttarget: {'enabled' if USVS.cmds['main'] else 'disabled'}')
		elif cmd in estop_sentinel:
			await estop()
		elif len(tokens) == 2:
			cmd = tokens[0]
			arg = tokens[1]
			if cmd in throttle_sentinel:
				try:
					percent = float(arg)
					if -100 <= percent <= 100:
						USVS.cmds['throttle'] = percent/100
						print(f'INFO: throttle set to {int(percent)}%')
					else:
						print(f'ERROR: invalid throttle percent - {arg}')
				except:
					print(f'ERROR: nonfloat throttle percent - {arg}')
			elif cmd in steering_sentinel:
				try:
					percent = float(arg)
					if -100 <= percent <= 100:
						USVS.cmds['steering'] = percent/100
						print(f'INFO: steering set to {int(percent)}%')
					else:
						print(f'ERROR: invalid steering percent - {arg}')
				except:
					print(f'ERROR: nonfloat steering percent - {arg}')
			elif cmd == 'cooling':
				try:
					percent = float(arg)
					if 0 <= percent <= 100:
						USVS.cmds['cooling'] = 255*int(percent/100)
						print(f'INFO: cooling set to {int(percent)}%')
					else:
						print(f'ERROR: invalid cooling percent - {arg}')
				except:
					print(f'ERROR: nonfloat cooling percent - {arg}')
			elif cmd == 'bilge':
				try:
					percent = float(arg)
					if 0 <= percent <= 100:
						USVS.cmds['bilge'] = 255*int(percent/100)
						print(f'INFO: bilge set to {int(percent)}%')
					else:
						print(f'ERROR: invalid bilge percent - {arg}')
				except:
					print(f'ERROR: nonfloat bilge percent - {arg}')
			elif cmd == 'aux':
				if arg in enable_sentinel:
					USVS.cmds['aux'] = True
					print(f'INFO: auxiliary power enabled')
				else:
					USVS.cmds['aux'] = False
					print(f'INFO: auxiliary power disabled')
			elif cmd == 'main':
				if arg in enable_sentinel:
					USVS.cmds['main'] = True
					print(f'INFO: main power enabled')
				else:
					USVS.cmds['main'] = False
					print(f'INFO: main power disabled')
			else:
				print(f'WARNING: unknown augmented command received - {cmd} - {arg}')
		else:
			print(f'WARNING: unknown command received - {cmd}')

async def controller_loop():
	if controller is None: return
	loop_rate = 100
	try:
		while True:
			pygame.event.pump()

			yaw = controller.get_axis(0)
			throttle = (1-controller.get_axis(2))/2

			reverse = controller.get_button(7)
			
			USVS.cmds['throttle'] = (-1 if reverse==1 else 1)*throttle
			USVS.cmds['steering'] = yaw
			
			await asyncio.sleep(1/loop_rate)
	except asyncio.CancelledError:
		print('INFO: controller link terminated')
	except Exception as e:
		print(f'ERROR: controller error - {e}')

# --- Entry Point ---
async def main():
	port = 9100
	async with websockets.serve(handler, '127.0.0.1', port):
		print(f'INFO: ground station server started on port {port}')

		transmit_task = None
		transmit_task = asyncio.create_task(transmit_loop(transmit_task))
		controller_task = asyncio.create_task(controller_loop())

		try:
			await console_loop()
		except asyncio.CancelledError:
			print(f'\fINFO: terminating')
		finally:
			transmit_task.cancel()
			controller_task.cancel()
			await controller_task
			results = await asyncio.gather(transmit_task, return_exceptions=True)
			results = list(filter(None, results))
			if results:
				print(f'INFO: termination completed with {len(results)} error(s) - {results}')
			else:
				print(f'INFO: termination complete')

if __name__ == '__main__': asyncio.run(main())