# Life Marriage Connect

यह मोबाइल वेबसाइट का शुरुआती deployable project है। इसमें केवल chat, photo और video sharing है।

## चलाने के लिए क्या चाहिए
- Node.js 20 या नया
- HTTPS सपोर्ट वाला Node.js hosting provider
- Hosting में persistent disk/storage (uploads और SQLite session database के लिए)

## Hosting पर सेटअप
1. ZIP को extract करें और पूरी project folder hosting पर upload करें।
2. Build/Install command: `npm install`
3. Start command: `npm start`
4. Hosting के Environment Variables में:
   - `ROOM_PASSWORD`: आप दोनों का secret password (कम-से-कम 12 characters)
   - `SESSION_SECRET`: अलग random secret (कम-से-कम 32 characters)
   - `NODE_ENV`: `production`
5. Deploy/Publish करें। Hosting जो HTTPS URL दे, वही दोनों फोन में Chrome से खोलें।
6. दोनों फोन पर एक ही `ROOM_PASSWORD` डालें।

## जरूरी सीमाएँ और सुरक्षा
- यह शुरुआती implementation है, audited production security product नहीं।
- दो browser sessions की सीमा लागू है; दस मिनट heartbeat न मिलने पर slot खाली माना जाता है। दोनों users के लिए अलग-अलग फोन/browser इस्तेमाल करें।
- Messages server memory में रहते हैं; restart पर chat text साफ हो जाता है। Photos/videos disk पर रखे जाते हैं और cleanup job लगभग हर मिनट चलकर एक घंटे पुराने uploads हटाती है।
- Hosting पर persistent disk न हो तो uploads/sessions restart के बाद सुरक्षित नहीं रहेंगे।
- Screenshot, screen recording, दूसरे फोन से फोटो लेना या डाउनलोड की गई copy अपने-आप delete नहीं की जा सकती।
- Shared password किसी तीसरे व्यक्ति को पता चल जाए तो वह कोशिश कर सकता है; इसे सार्वजनिक रूप से साझा न करें। HTTPS अनिवार्य रखें।
- Production use से पहले rate limiting, stronger device enrollment, malware scanning, encrypted storage, backup-retention policy और security review जोड़ना उचित है।
- अधिकतम upload size 50 MB है। केवल JPEG/PNG/WebP/GIF फोटो और MP4/WebM/QuickTime वीडियो स्वीकार होते हैं।
