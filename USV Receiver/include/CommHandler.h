#include <XBee.h>
#include <VescUart.h>

#define DRIVE_CMD 0x00
#define COOLING_CMD 0x01
#define BILGE_CMD 0x02
#define MAIN_CMD 0x03
#define AUX_CMD 0x04
#define RESET_CMD 0x05

#define TELEM 0x00
#define GS_LINK_LOST 0x01
#define ESC_LINK_LOST 0x02
#define MAIN_CTRL_LOST 0x03

class CommHandler
{
public:
	CommHandler(Stream& serial);
	struct commands {
		float throttle = 0;
		float steering = 0;
		short cooling;
		short bilge;
		bool main;
		bool aux;
	};
	struct __attribute__((packed)) telemetry
	{
		float throttle;
		float steering;
		uint8_t flags;
		float avgMotorCurrent;
		float avgInputCurrent;
		float dutyCycleNow;
		float eRPM;
		float inpVoltage;
		float wattHours;
		float wattHoursCharged;
		float tempMosfet;
		float tempMotor;
		uint32_t time;
	};
	commands cmds;
	float throttle = 0;
	float steering = 0;
	bool mainEnable;
	bool auxEnable;
	bool mainEcho;
	void read(uint32_t now, bool* controlledContactorPtr);
	void send(uint32_t now, VescUart& ESC, bool gsLinkActive, bool escLinkActive, bool controlledContactor);
	uint32_t mainOffStamp;
	uint32_t lastReceived;
	void sendRawAPI(XBeeAddress64 address, uint8_t* payload, int pyaloadLen);
private:
	void unknownCmd(uint32_t now, uint8_t* cmd);
	void invalidCmd(uint32_t now, uint8_t* cmd);
	Stream& serial;

	static XBeeAddress64 addrGS;
	
	XBee xbee = XBee();
	ZBRxResponse rx = ZBRxResponse();
	AtCommandResponse at = AtCommandResponse();
	TxStatusResponse txStatus = TxStatusResponse();
};