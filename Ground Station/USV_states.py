# import numpy as np
import struct

DRIVE_CMD = 0x00
COOLING_CMD = 0x01
BILGE_CMD = 0x02
MAIN_CMD = 0x03
AUX_CMD = 0x04
RESET_CMD = 0x05

cmds = {
	'throttle': 0,
	'steering': 0,
	'cooling': 0,
	'bilge': 0,
	'main': False,
	'aux': False,
}

telem = {
	'ESC': {
		'motorCurrent': 0,
		'inputCurrent': 0,
		'dutyCycleNow': 0,
		'eRPM': 0,
		'inputVoltage': 0,
		'wattHours': 0,
		'wattHoursCharged': 0,
		'tempMosfet': 0,
		'tempMotor': 0,
	},
	'throttle': 0,
	'steering': 0,
	'mainEnable': False,
	'auxEnable': False,
	'mainEcho': False,
	'gsLinkActive': False,
	'escLinkActive': False,
	'controlledContactor': False,
	'time': 0,
	
	'usvLinkActive': False,
	'rssi': 0
}

def pack_drive(): return struct.pack("<Bff", DRIVE_CMD, cmds['throttle'], cmds['steering'])
def pack_cooling(): return struct.pack("<BB", COOLING_CMD, cmds['cooling'])
def pack_bilge(): return struct.pack("<BB", BILGE_CMD, cmds['bilge'])
def pack_main(): return struct.pack("<B?", MAIN_CMD, cmds['main'])
def pack_aux(): return struct.pack("<B?", AUX_CMD, cmds['aux'])
def pack_reset(): return struct.pack("<B", RESET_CMD)

TELEM_FMT = "<ffBfffffffffI"
TELEM_SIZE = struct.calcsize(TELEM_FMT)

def unpack_telem(data):
	data_size = len(data)
	if data_size == TELEM_SIZE:
		unpacked = struct.unpack(TELEM_FMT, data)
		telem['throttle'] = unpacked[0]
		telem['steering'] = unpacked[1]
		telem['ESC']['motorCurrent'] = unpacked[3]
		telem['ESC']['inputCurrent'] = unpacked[4]
		telem['ESC']['dutyCycleNow'] = unpacked[5]
		telem['ESC']['eRPM'] = unpacked[6]
		telem['ESC']['inputVoltage'] = unpacked[7]
		telem['ESC']['wattHours'] = unpacked[8]
		telem['ESC']['wattHoursCharged'] = unpacked[9]
		telem['ESC']['tempMosfet'] = unpacked[10]
		telem['ESC']['tempMotor'] = unpacked[11]
		telem['time'] = unpacked[12]

		flags = unpacked[2]
		telem['mainEnable'] = bool(flags & (1 << 0))
		telem['auxEnable'] = bool(flags & (1 << 1))
		telem['mainEcho'] = bool(flags & (1 << 2))
		telem['gsLinkActive'] = bool(flags & (1 << 3))
		telem['escLinkActive'] = bool(flags & (1 << 4))
		telem['controlledContactor'] = bool(flags & (1 << 5))
	else:
		print(f'WARNING: received corrupted telemetry of length {data_size}, expected {TELEM_SIZE}')