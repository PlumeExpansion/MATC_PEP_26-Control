### Control and communications between ground station and USV for MATC team competing in PEP 26
---
Ground station consists of
- Laptop
- HOTAS
- XBee XR 900

USV receiver control circuit consists of
- Teensy 4.1
- XBee XR 900
- IMU (optional)
- GPS (optional)

Details on components, wiring, startup/shutdown sequence can be found [here](https://docs.google.com/document/d/1pb3P5QaangbH325uTRs-FefswTTehO3T3uK7tuayAIE/edit?pli=1&tab=t.uitmrmt3qy6o#heading=h.onfym6wzi3e6)
- Ground Station code done in Python
- Interface done in JavaScript
- USV receiver code done in C++ with PlatformIO

To start ground station, run server.bat in Ground Station folder. Ensure Python is installed and dependencies listed in requirements.txt are installed. \
To start interface, run server.bat in Ground Station/interface. Ensure NodeJS is installed and dependencies listed in package.json are installed.

Controls and telemetry is broadcasted on localhost:9100, interface server is started on localhost:9910.
