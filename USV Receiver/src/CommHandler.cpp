#include "CommHandler.h"

XBeeAddress64 CommHandler::addrGS = XBeeAddress64(0x0013A200, 0x42839F27);

CommHandler::CommHandler(Stream& serial): serial(serial)
{
	xbee.setSerial(serial);
}

void CommHandler::read(uint32_t now, bool* gsLinkActivePtr, bool* controlledContactorPtr)
{
	xbee.readPacket();
	if (xbee.getResponse().isAvailable())
	{
		if (xbee.getResponse().getApiId() == ZB_RX_RESPONSE)
		{
			this->lastReceived = now;
			xbee.getResponse().getZBRxResponse(rx);

			*gsLinkActivePtr = true;
			// if (rx.getRemoteAddress64().get() != CommHandler::addrGS.get())
			// {
			// 	Serial.printf("WARNING [%lu]: received from unknown address: %X\n", now, rx.getRemoteAddress64().get());
			// }
			// else
			// {
				uint8_t* data = rx.getData();
				uint8_t cmdId = data[0];
				// Serial.print("CMD ID: ");
				// Serial.println(cmdId, HEX);
				switch (cmdId)
				{
					case DRIVE_CMD:
					{
						if (rx.getDataLength() == 9)
						{
							memcpy(&this->cmds.throttle, &data[1], 4);
							memcpy(&this->cmds.steering, &data[5], 4);
						}
						else invalidCmd(now, data);
						break;
					}
					case COOLING_CMD:
					{
						if (rx.getDataLength() == 2) this->cmds.cooling = data[1];
						else invalidCmd(now, data);
						break;
					}
					case BILGE_CMD:
					{
						if (rx.getDataLength() == 2) this->cmds.bilge = data[1];
						else invalidCmd(now, data);
						break;
					}
					case MAIN_CMD:
					{
						if (rx.getDataLength() == 2) this->cmds.main = data[1];
						else invalidCmd(now, data);
						if (!cmds.main) mainOffStamp = now;
						break;
					}
					case AUX_CMD:
					{
						// Serial.print("DEBUG: aux cmd ");
						// Serial.println(data[1]);
						if (rx.getDataLength() == 2) this->cmds.aux = data[1];
						else invalidCmd(now, data);
						break;
					}
					case RESET_CMD:
					{
						*controlledContactorPtr = true;
						Serial.printf("INFO [%lu]: resetting contactor flag\n", now);
						break;
					}
					default:
						unknownCmd(now, data);
				}
			// }
		}
		else if (xbee.getResponse().isError())
		{
			Serial.printf("ERROR [%lu]: error reading packet, code: %X\n", now, xbee.getResponse().getErrorCode());
		}
		else if (xbee.getResponse().getApiId() != ZB_TX_STATUS_RESPONSE)
		{
			Serial.printf("INFO [%lu]: received response, id: %X\n", now, xbee.getResponse().getApiId());
		}
	}
}

void CommHandler::send(uint32_t now, VescUart& ESC, bool gsLinkActive, bool escLinkActive, bool controlledContactor)
{
	telemetry telem;
	telem.throttle = throttle;
	telem.steering = steering;
	telem.flags = 0;
	telem.flags |= (mainEnable << 0);
	telem.flags |= (auxEnable << 1);
	telem.flags |= (mainEcho << 2);
	telem.flags |= (gsLinkActive << 3);
	telem.flags |= (escLinkActive << 4);
	telem.flags |= (controlledContactor << 5);
	telem.avgMotorCurrent = ESC.data.avgMotorCurrent;
	telem.avgInputCurrent = ESC.data.avgInputCurrent;
	telem.dutyCycleNow = ESC.data.dutyCycleNow;
	telem.eRPM = ESC.data.rpm;
	telem.inpVoltage = ESC.data.inpVoltage;
	telem.wattHours = ESC.data.wattHours;
	telem.wattHoursCharged = ESC.data.wattHoursCharged;
	telem.tempMosfet = ESC.data.tempMosfet;
	telem.tempMotor = ESC.data.tempMotor;
	telem.time = now;

	// Serial.println(telem.throttle);
	// Serial.println(telem.steering);
	// Serial.println(mainEnable);
	// Serial.println(auxEnable);
	// Serial.println(mainEcho);

	// Serial.print("Aux ");
	// Serial.println(cmds.aux);
	// Serial.print("Main ");
	// Serial.println(cmds.main);
	// Serial.print("Steering ");
	// Serial.println(cmds.steering);
	// Serial.print("Throttle ");
	// Serial.println(cmds.throttle);
	// Serial.print("Cooling ");
	// Serial.println(cmds.cooling);
	// Serial.print("Bilge ");
	// Serial.println(cmds.bilge);

	sendRawAPI(addrGS, (uint8_t*)&telem, sizeof(telem));
}

void CommHandler::unknownCmd(uint32_t now, uint8_t * cmd)
{
	Serial.printf("WARNING [%lu]: received unknown command: ", now);
	Serial.println(*cmd);
}

void CommHandler::invalidCmd(uint32_t now, uint8_t * cmd)
{
	Serial.printf("WARNING [%lu]: received invalid command: ", now);
	Serial.println(*cmd);
}

void CommHandler::sendRawAPI(XBeeAddress64 address, uint8_t * payload, int payloadLen)
{
	uint16_t frameLen = 14 + payloadLen;
	uint8_t header[14];

	int pos = 0;
	header[pos++] = 0x10;
	header[pos++] = 0x00;

	header[pos++] = (uint8_t)(address.getMsb() >> 24);
	header[pos++] = (uint8_t)(address.getMsb() >> 16);
	header[pos++] = (uint8_t)(address.getMsb() >> 8);
	header[pos++] = (uint8_t)(address.getMsb());
	header[pos++] = (uint8_t)(address.getLsb() >> 24);
	header[pos++] = (uint8_t)(address.getLsb() >> 16);
	header[pos++] = (uint8_t)(address.getLsb() >> 8);
	header[pos++] = (uint8_t)(address.getLsb());

	header[pos++] = 0xFF;
	header[pos++] = 0xFE;
	header[pos++] = 0x00;
	header[pos++] = 0x00;

	long sum = 0;
	for (int i=0; i<pos; i++) sum += header[i];
	for (int i=0; i<payloadLen; i++) sum += payload[i];
	uint8_t checksum = 0xFF - (sum & 0xFF);

	this->serial.write(0x7E);
	this->serial.write((frameLen >> 8) & 0xFF);
	this->serial.write(frameLen & 0xFF);
	this->serial.write(header, pos);
	this->serial.write(payload, payloadLen);
	this->serial.write(checksum);
	this->serial.flush();

	// Serial.print("INFO: sending - ");
	// Serial.println(*payload);
}
