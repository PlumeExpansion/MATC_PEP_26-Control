#include <arduino.h>
#include <VescUart.h>

#include "CommHandler.h"

#define BAUD_XBEE 115200
#define BAUD_ESC 115200
#define SERIAL_XBEE Serial4
#define SERIAL_ESC Serial1

#define TIMEOUT_ESC 20
#define LOOP_RATE 100
#define TELEM_RATE 5
#define STEERING_DEADZONE 0.01

#define PIN_AUX 4
#define PIN_MAIN 5
#define PIN_MAIN_ECHO 6
#define PIN_COOLING 7
#define PIN_BILGE 8
#define PIN_LIN_ACT_FORW 9
#define PIN_LIN_ACT_BACK 10

CommHandler commHandler(SERIAL_XBEE);
VescUart ESC(TIMEOUT_ESC);

void failLoop(int failMode)
{
	while (true)
	{
		digitalWrite(LED_BUILTIN, HIGH);
		delay(1000);
		digitalWrite(LED_BUILTIN, LOW);
		delay(1000);
		for (int i=0; i<failMode; i++)
		{
			digitalWrite(LED_BUILTIN, HIGH);
			delay(200);
			digitalWrite(LED_BUILTIN, LOW);
			delay(200);
		}
	}
}

void setup()
{
	Serial.begin(0);
	pinMode(LED_BUILTIN, OUTPUT);
	pinMode(PIN_AUX, OUTPUT);
	pinMode(PIN_MAIN, OUTPUT);
	pinMode(PIN_MAIN_ECHO, INPUT_PULLUP);
	pinMode(PIN_COOLING, OUTPUT);
	pinMode(PIN_BILGE, OUTPUT);
	pinMode(PIN_COOLING, OUTPUT);
	pinMode(PIN_BILGE, OUTPUT);
	pinMode(PIN_LIN_ACT_FORW, OUTPUT);
	pinMode(PIN_LIN_ACT_BACK, OUTPUT);

	SERIAL_XBEE.begin(BAUD_XBEE);
	SERIAL_ESC.begin(BAUD_ESC);
	
	while (!Serial && millis() < 2000);
	Serial.printf("INFO [%lu]: serial initialized\n", millis());

	while (!SERIAL_XBEE)
	{
		if (millis() > 5000)
		{
			Serial.printf("ERROR [%lu]: XBee serial failed to initialize\n", millis());
			failLoop(0);
		}
	}
	Serial.printf("INFO [%lu]: XBee serial initialized\n", millis());

	while (!SERIAL_ESC)
	{
		if (millis() > 5000)
		{
			Serial.printf("ERROR [%lu]: ESC serial failed to initialize\n", millis());
			failLoop(1);
		}
	}
	Serial.printf("INFO [%lu]: ESC serial initialized\n", millis());
	ESC.setSerialPort(&SERIAL_ESC);
	// // ESC.getVescValues
	// if (ESC.getVescValues())
	// {
	// 	Serial.printf("INFO: [%lu]: ESC running firmware version \"%lu.%lu\"\n", millis(), ESC.fw_version.major, ESC.fw_version.minor);
	// }
	// else
	// {
	// 	Serial.printf("ERROR [%lu]: ESC failed to initialize\n", millis());
	// 	failLoop(2);
	// }
	
	Serial.printf("INFO [%lu]: USV initialized\n", millis());
}

uint32_t lastESC;
bool escLinkActive = true;
bool gsLinkActive = true;
bool controlledContactor = true;
void getData(uint32_t now)
{
	commHandler.mainEcho = digitalRead(PIN_MAIN_ECHO) == LOW;
	// bool getFW = ESC.getFWversion();
	// bool getVal = ESC.getVescValues();
	// Serial.print("getFW: ");
	// Serial.print(getFW);
	// Serial.print("\tgetVal: ");
	// Serial.println(getVal);
	if (ESC.getVescValues())
	{
		lastESC = now;
		escLinkActive = true;
	}
}

void checkSafety(uint32_t now)
{
	if (gsLinkActive)
	{
		digitalWrite(LED_BUILTIN, HIGH);
		if (now - commHandler.lastReceived > 1000)
		{
			gsLinkActive = false;
			commHandler.throttle = 0;
			commHandler.steering = 0;
			Serial.printf("WARNING [%lu]: GS link lost, nulling controls\n", now);
		}
	}
	else
	{
		digitalWrite(LED_BUILTIN, LOW);
	}
	if (escLinkActive && now - lastESC > 1000)
	{
		escLinkActive = false;
		commHandler.mainOffStamp = now;
		commHandler.throttle = 0;
		commHandler.steering = 0;
		commHandler.mainEnable = false;
		Serial.printf("WARNING [%lu]: ESC link lost, cutting main power\n", now);
	}
	if (controlledContactor && !commHandler.mainEnable && commHandler.mainEcho && now - commHandler.mainOffStamp > 1000)
	{
		controlledContactor = false;
		commHandler.auxEnable = false;
		commHandler.throttle = 0;
		commHandler.steering = 0;
		Serial.printf("WARNING [%lu]: contactor still energized, cutting auxiliary power\n", now);
	}
}

void setControls(uint32_t now)
{
	if (controlledContactor)
	{
		commHandler.auxEnable = commHandler.cmds.aux;
		if (gsLinkActive)
		{
			commHandler.throttle = commHandler.cmds.throttle;
			commHandler.steering = commHandler.cmds.steering;
			commHandler.mainEnable = commHandler.cmds.main;
		}
	}
	ESC.setDuty(commHandler.throttle);
	
	// TODO: add encoder
	if (commHandler.steering > STEERING_DEADZONE)
	{
		analogWrite(PIN_LIN_ACT_FORW, (int)(commHandler.steering*256));
		analogWrite(PIN_LIN_ACT_BACK, LOW);
	}
	else if (commHandler.steering < -STEERING_DEADZONE)
	{
		analogWrite(PIN_LIN_ACT_BACK, (int)(-commHandler.steering*256));
		analogWrite(PIN_LIN_ACT_FORW, LOW);
	}
	else
	{
		analogWrite(PIN_LIN_ACT_FORW, LOW);
		analogWrite(PIN_LIN_ACT_BACK, LOW);
	}
	analogWrite(PIN_COOLING, (int)((float)commHandler.cmds.cooling*256/255));
	analogWrite(PIN_BILGE, (int)((float)commHandler.cmds.bilge*256/255));
	digitalWrite(PIN_MAIN, commHandler.mainEnable? HIGH : LOW);
	digitalWrite(PIN_AUX, commHandler.auxEnable? HIGH : LOW);
}

uint32_t now;
uint32_t last;
uint32_t lastTelem;
void loop()
{
	now = millis();
	if (now-last < 1000/LOOP_RATE) return;
	last = now;
	commHandler.read(now, &gsLinkActive, &controlledContactor);
	
	getData(now);
	checkSafety(now);
	setControls(now);

	if (now-lastTelem < 1000/TELEM_RATE) return;
	lastTelem = now;
	commHandler.send(now, ESC, gsLinkActive, escLinkActive, controlledContactor);
}