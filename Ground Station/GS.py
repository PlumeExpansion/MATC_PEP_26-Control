import pygame
from digi.xbee.devices import XBeeDevice, RemoteXBeeDevice
from digi.xbee.models.address import XBee64BitAddress

# 1. Setup XBee
PORT = "COM4"
BAUD = 38400
device = XBeeDevice(PORT, BAUD)
device.open()
device.serial_port.rtscts = True # type: ignore # Enable Flow Control for the Waveshare board

# Define the boat (replace with your boat's MAC address)
boat_addr = XBee64BitAddress.from_hex_string("0013A200XXXXXXXX")
remote_boat = RemoteXBeeDevice(device, boat_addr)

# 2. Setup Pygame & HOTAS
pygame.init()
pygame.joystick.init()

if pygame.joystick.get_count() == 0:
	print("No HOTAS detected!")
	exit()

hotas = pygame.joystick.Joystick(0)
hotas.init()

# 3. Telemetry Callback (Handles incoming data from boat)
def on_data_received(xbee_message):
	data = xbee_message.data.decode()
	print(f"\n[BOAT TELEMETRY] RSSI: {xbee_message.rssi} dBm | Data: {data}")

device.add_data_received_callback(on_data_received)

# 4. Main Control Loop
clock = pygame.time.Clock()
running = True

try:
	while running:
		for event in pygame.event.get():
			if event.type == pygame.QUIT:
				running = False

		# Read HOTAS Axes (usually Axis 1 is Pitch/Throttle, Axis 0 is Roll/Steer)
		throttle = hotas.get_axis(1) 
		steering = hotas.get_axis(0)

		# Convert float (-1.0 to 1.0) to a simple string for the boat
		# Example: "T:0.5,S:-0.2"
		command = f"T:{throttle:.2f},S:{steering:.2f}"
		
		# Send to boat (Using send_data_async so it doesn't lag the joystick loop)
		device.send_data_async(remote_boat, command)

		# Run loop at 20Hz (sending 20 commands per second is plenty for a boat)
		clock.tick(20) 

finally:
	device.close()
	pygame.quit()