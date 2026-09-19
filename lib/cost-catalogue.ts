// Starting points for the two cost tables in the submission form. Nothing here is a price: parts and services are
// bought at wildly different rates, so only the names are offered and every amount stays the team's own to type.
// Names are spelled the way the technology logo lookup expects them (see technologyLogo in ProjectIdentity.tsx),
// so a row picked from these lists shows its real logo rather than a fallback glyph.
export type CostGroup={group:string;items:string[]};

// A part and the versions of it a team might actually have bought. `models` only seeds the suggestions — the model
// field stays free text, because a board released after this list was written (a newer Pi, a newer Arduino) must
// still be recordable without editing any code.
export type CostPart={name:string;models?:string[]};
export type HardwareGroup={group:string;items:CostPart[]};

export const hardwareParts:HardwareGroup[]=[
  {group:'Boards & controllers',items:[
    {name:'Arduino Uno',models:['R3','R3 (A000066)','R4 Minima','R4 WiFi','SMD R3']},
    {name:'Arduino Nano',models:['ATmega328P','Nano Every','Nano 33 IoT','Nano 33 BLE','Nano ESP32','Nano RP2040 Connect']},
    {name:'Arduino Mega',models:['2560 R3','ADK R3']},
    {name:'Arduino Leonardo',models:['A000057']},
    {name:'Arduino Pro Mini',models:['5V 16MHz','3.3V 8MHz']},
    {name:'Raspberry Pi',models:['5 (4GB)','5 (8GB)','5 (16GB)','4 Model B (2GB)','4 Model B (4GB)','4 Model B (8GB)','3 Model B+','Zero 2 W','400']},
    {name:'Raspberry Pi Pico',models:['Pico','Pico H','Pico W','Pico 2','Pico 2 W']},
    {name:'ESP32',models:['DevKit V1','WROOM-32','WROVER','S3','C3','C6']},
    {name:'ESP8266',models:['NodeMCU V3','Wemos D1 Mini','ESP-01']},
    {name:'STM32',models:['Blue Pill F103C8T6','Black Pill F411CE','Nucleo F401RE']},
    {name:'ATtiny',models:['ATtiny85','ATtiny84']},
    {name:'micro:bit',models:['V2','V1.5']},
    {name:'NVIDIA Jetson',models:['Nano 4GB','Orin Nano']},
  ]},
  {group:'Sensors',items:[
    {name:'Temperature & humidity sensor',models:['DHT11','DHT22 (AM2302)','SHT31']},
    {name:'Temperature sensor',models:['TMP36','LM35','DS18B20','MLX90614 (IR)']},
    {name:'Ultrasonic distance sensor',models:['HC-SR04','HC-SR04P','JSN-SR04T']},
    {name:'PIR motion sensor',models:['HC-SR501','AM312']},
    {name:'Light sensor',models:['LDR (photoresistor)','BH1750','TSL2561']},
    {name:'Gas sensor',models:['MQ-2','MQ-3','MQ-7','MQ-135']},
    {name:'Soil moisture sensor',models:['Capacitive v1.2','Resistive YL-69']},
    {name:'IMU / accelerometer',models:['MPU6050','MPU9250','ADXL345','BNO055']},
    {name:'GPS module',models:['NEO-6M','NEO-7M','NEO-M8N']},
    {name:'Load cell with amplifier',models:['HX711 + 5kg','HX711 + 20kg']},
    {name:'IR sensor',models:['TCRT5000','TSOP1738','E18-D80NK']},
    {name:'Flex / force sensor',models:['2.2" flex','FSR 402']},
    {name:'Pressure / altitude sensor',models:['BMP280','BME280','MPX5700']},
    {name:'Current sensor',models:['ACS712 20A','INA219']},
    {name:'Pulse / heart-rate sensor',models:['MAX30102','Pulse Sensor']},
  ]},
  {group:'Motors & actuators',items:[
    {name:'Servo motor',models:['SG90','MG90S','MG996R','DS3218']},
    {name:'Stepper motor',models:['28BYJ-48 + ULN2003','NEMA 17','NEMA 23']},
    {name:'DC gear motor',models:['BO motor 150RPM','N20 300RPM','johnson 1000RPM']},
    {name:'Motor driver',models:['L298N','L293D','TB6612FNG','A4988','DRV8825','BTS7960']},
    {name:'Relay module',models:['1-channel 5V','2-channel 5V','4-channel 5V','SPDT']},
    {name:'Water pump',models:['5V submersible','12V DC']},
    {name:'Solenoid valve',models:['12V 1/2"']},
    {name:'Vibration motor',models:['Coin 3V']},
  ]},
  {group:'Power',items:[
    {name:'LiPo battery',models:['3.7V 1000mAh','3.7V 2000mAh','7.4V 2200mAh']},
    {name:'18650 cell and holder',models:['3000mAh','2600mAh','2-cell holder']},
    {name:'Battery',models:['9V alkaline','12V SLA 7Ah','AA x4 holder']},
    {name:'Charging module',models:['TP4056','TP4056 with protection']},
    {name:'Buck converter',models:['LM2596','MP1584','XL4015']},
    {name:'Boost converter',models:['MT3608','XL6009']},
    {name:'Solar panel',models:['6V 1W','12V 10W','12V 20W']},
    {name:'SMPS adapter',models:['5V 2A','12V 2A']},
  ]},
  {group:'Display & interface',items:[
    {name:'LCD display',models:['16x2 HD44780','16x2 with I2C','20x4 with I2C']},
    {name:'OLED display',models:['0.96" SSD1306','1.3" SH1106']},
    {name:'TFT display',models:['1.8" ST7735','2.4" ILI9341 touch','3.5" touch']},
    {name:'Seven-segment display',models:['1-digit','4-digit TM1637']},
    {name:'LED',models:['5mm red','5mm RGB','WS2812B NeoPixel strip','LED matrix MAX7219']},
    {name:'Keypad',models:['4x4 matrix','4x3 matrix']},
    {name:'Buzzer',models:['Active 5V','Passive piezo']},
    {name:'Pushbutton / switch',models:['Tactile 6mm','Slide switch','Rocker switch','Limit switch']},
    {name:'Potentiometer',models:['10k linear','10k trimpot','Rotary encoder KY-040']},
  ]},
  {group:'Connectivity',items:[
    {name:'Bluetooth module',models:['HC-05','HC-06','HM-10 BLE']},
    {name:'LoRa module',models:['SX1278 433MHz','RFM95 868MHz']},
    {name:'RF module',models:['NRF24L01','NRF24L01 + PA/LNA','433MHz TX/RX pair']},
    {name:'GSM / LTE module',models:['SIM800L','SIM900A','SIM7600']},
    {name:'RFID reader',models:['RC522 13.56MHz','PN532','EM-18 125kHz']},
    {name:'Camera module',models:['ESP32-CAM (OV2640)','Pi Camera v2','Pi Camera v3']},
    {name:'Ethernet / WiFi shield',models:['W5100','ESP-01 adapter']},
  ]},
  {group:'Components & ICs',items:[
    {name:'Resistor set',models:['1/4W assorted','10k x100']},
    {name:'Capacitor set',models:['Ceramic assorted','Electrolytic assorted']},
    {name:'Transistor',models:['2N2222','BC547','TIP122','IRF540N MOSFET']},
    {name:'Diode',models:['1N4007','1N4148','Zener 5.1V']},
    {name:'Timer / op-amp IC',models:['NE555','LM358','LM741']},
    {name:'Logic IC',models:['74HC595 shift register','74HC00','CD4017']},
    {name:'Voltage regulator',models:['7805','AMS1117 3.3V']},
    {name:'Optocoupler',models:['4N35','PC817']},
  ]},
  {group:'Build materials',items:[
    {name:'Breadboard',models:['830-point','400-point','170-point mini']},
    {name:'Jumper wires',models:['M-M 40pcs','M-F 40pcs','F-F 40pcs']},
    {name:'PCB',models:['Perfboard 7x9cm','Custom 2-layer','Zero PCB']},
    {name:'3D printing filament',models:['PLA 1kg','PETG 1kg','ABS 1kg']},
    {name:'Acrylic sheet',models:['3mm','5mm']},
    {name:'Aluminium extrusion',models:['2020 profile 1m']},
    {name:'Project enclosure',models:['ABS box','IP65 junction box']},
    {name:'Screws and fasteners',models:['M3 assorted','Standoff set']},
    {name:'Soldering supplies',models:['60/40 solder wire','Flux paste','Soldering iron 25W']},
  ]},
];

/** Suggested models for a typed part name, matched loosely so "arduino uno r3" still finds the Uno's list. */
export function modelsForPart(name:string) {
  const value=name.trim().toLowerCase();
  if(!value)return [];
  const parts=hardwareParts.flatMap(group=>group.items);
  const hit=parts.find(part=>part.name.toLowerCase()===value)
    ??parts.find(part=>value.includes(part.name.toLowerCase())||part.name.toLowerCase().includes(value));
  return hit?.models??[];
}

/** Shops student teams actually order parts from. The domain fills the website field and supplies the shop's logo. */
export type HardwareShop={name:string;domain:string};
export const hardwareShops:HardwareShop[]=[
  {name:'Amazon',domain:'amazon.in'},
  {name:'Flipkart',domain:'flipkart.com'},
  {name:'Robu.in',domain:'robu.in'},
  {name:'Robocraze',domain:'robocraze.com'},
  {name:'ElectronicsComp',domain:'electronicscomp.com'},
  {name:'Evelta',domain:'evelta.com'},
  {name:'Sunrom',domain:'sunrom.com'},
  {name:'Element14',domain:'element14.com'},
  {name:'Mouser Electronics',domain:'mouser.in'},
  {name:'DigiKey',domain:'digikey.in'},
  {name:'AliExpress',domain:'aliexpress.com'},
  {name:'Adafruit',domain:'adafruit.com'},
  {name:'SparkFun',domain:'sparkfun.com'},
];

export const softwareServices:CostGroup[]=[
  {group:'Hosting & deployment',items:['Vercel','Netlify','Render','Railway','Heroku','AWS','Google Cloud','Azure','DigitalOcean','Cloudflare']},
  {group:'Databases & backend',items:['Firebase','Supabase','MongoDB','PostgreSQL (Neon DB)','PlanetScale','Redis','Appwrite']},
  {group:'APIs & AI',items:['OpenAI API','Gemini API','Anthropic API','Hugging Face','Twilio','SendGrid','Google Maps API','Razorpay']},
  {group:'Tools & licences',items:['GitHub Copilot','ChatGPT','Figma','Notion','Canva','MATLAB','SolidWorks','AutoCAD','IntelliJ IDEA']},
  {group:'Domains & accounts',items:['Domain name','SSL certificate','Play Store developer account','App Store developer account']},
];
