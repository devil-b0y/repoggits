import languages from './programming-languages.json';
import logos from './technology-tag-logos.json';

/** Local, searchable suggestions; custom tags remain supported. */
export const technologyTags=Array.from(new Set([
 'Next.js','React','TypeScript','Python','Node.js','Arduino','ESP32','IoT','PostgreSQL',
 ...Object.keys(logos),...languages.map(language=>language.name),
 'MongoDB','Firebase','Supabase','Redis','Docker','Git','GitHub','Figma','VS Code','Arduino IDE',
 'TensorFlow','PyTorch','FastAPI','Flask','Playwright','Vercel','PostgreSQL (Neon DB)',
 'HTML','CSS','React Native','Nuxt','Astro','Remix','NestJS','Fastify','Laravel','Ruby on Rails',
 '.NET','ROS','ROS 2','PlatformIO','Chrome DevTools','LocalStorage','REST API','WebSocket','MQTT',
 'Machine Learning','Deep Learning','Artificial Intelligence','Computer Vision','Face Recognition',
 'Natural Language Processing','Large Language Models','RAG','Chatbot','Generative AI',
 'Data Science','Data Analytics','Data Visualization','Image Processing','Speech Recognition',
 'Robotics','Embedded Systems','Microcontrollers','ESP8266','STM32','PIC','FPGA','VLSI',
 'Circuit Design','PCB Design','Sensors','Ultrasonic Sensor','Temperature Sensor','RFID','NFC',
 'GPS','Bluetooth','Wi-Fi','LoRa','Zigbee','Serial Communication','I2C','SPI','UART',
 'Automation','Home Automation','Smart Agriculture','Wearables','Drones','3D Printing','CAD',
 'SolidWorks','AutoCAD','KiCad','Proteus','Multisim','MATLAB Simulink','LabVIEW',
 'Cybersecurity','Cryptography','Authentication','OAuth','JWT','Blockchain','Smart Contracts',
 'Web3','Ethereum','IPFS','Cloud Computing','AWS','CI/CD','DevOps','Serverless','Microservices',
 'Unit Testing','Integration Testing','Accessibility','Responsive Design','UI Design','UX Design',
 'Progressive Web App','Mobile App','Desktop App','Game Development','Augmented Reality',
 'Virtual Reality','Attendance System','Campus Navigation','Student Productivity','Task Management',
 'Healthcare','Education','E-commerce','FinTech','Sustainability','Renewable Energy'
]));
export function tagMatches(name:string,query:string){
 const needle=query.trim().toLowerCase();
 return name.toLowerCase().includes(needle)||languages.some(language=>language.name===name&&language.aliases.some(alias=>alias.toLowerCase().includes(needle)));
}
