# Comprehensive Manual Testing Checklist for Aurelia Android AI Agent

This checklist covers all 13 task capability categories and safety/reliability systems of the Aurelia Android AI Agent. Perform these steps on an Android device to verify full functionality.

---

## Prerequisites
- [ ] Install Aurelia APK (`cd app/android && ./gradlew installDebug`)
- [ ] Enable Accessibility Service: `Settings -> Accessibility -> Aurelia Agent Automation Service`
- [ ] Enable Overlay Permission: `Settings -> Apps -> Aurelia -> Display over other apps`
- [ ] Start FastAPI backend (`cd backend && uvicorn main:app --reload`)

---

## 1. Phone & Calling
- [ ] **Call Contact by Name**: Say "Call Mom" -> Verify safety confirmation modal appears with recipient details -> Tap "Proceed" -> Verify call is placed.
- [ ] **Call Raw Number**: Say "Call 555-123-4567" -> Confirm modal -> Verify phone call initiated.
- [ ] **Prefill Dialer**: Say "Open dialer with number 9876543210" -> Verify dialer opens with number prefilled without auto-dialing.
- [ ] **Read Call Log & Redial**: Say "Redial last call" -> Verify agent checks call log and prompts redial.

## 2. SMS / Messaging
- [ ] **Send SMS**: Say "Send an SMS to Raj saying I am on my way" -> Verify safety modal shows recipient and message preview -> Confirm -> Verify SMS opens/sends.
- [ ] **WhatsApp Message**: Say "Find Priya's number and send her a WhatsApp message saying I'm running late" -> Confirm -> Verify WhatsApp opens chat with pre-filled message.
- [ ] **Telegram Messaging**: Say "Send Telegram message to Alex" -> Confirm -> Verify Telegram opens with message.

## 3. Email (Gmail & Generic)
- [ ] **Compose Email**: Say "Open Gmail and email Raj asking if he's free tomorrow" -> Confirm -> Verify Gmail compose screen opens with To, Subject, Body filled.
- [ ] **Search Inbox**: Say "Search Gmail for invoices" -> Verify search bar is filled and executed in Gmail.

## 4. Web Browsing & Job Search (Chrome, LinkedIn, Indeed, Naukri)
- [ ] **Open URL**: Say "Open google.com in Chrome" -> Verify Chrome opens target URL.
- [ ] **Google Search**: Say "Search for software engineer jobs in Bangalore on Google" -> Verify browser opens with search query results.
- [ ] **Job Search Workflow**: Say "Search for software engineer jobs in Bangalore on LinkedIn and open the first result" -> Verify LinkedIn opens, inputs keywords "software engineer", location "Bangalore", executes search, and taps first job listing.

## 5. Contacts
- [ ] **Search Contact**: Say "Find Raj in contacts" -> Verify Contacts app opens and searches for "Raj".
- [ ] **Create Contact**: Say "Add new contact John Doe with phone 555-0000" -> Verify contacts creation screen opens prefilled.

## 6. Calendar & Reminders
- [ ] **Set Event**: Say "Schedule dentist appointment for tomorrow at 3pm" -> Verify calendar event is created with correct ISO start/end timestamps.
- [ ] **Set Alarm**: Say "Set an alarm for 7am" -> Verify native AlarmClock intent configures alarm for 7:00 AM.
- [ ] **Set Timer**: Say "Set a timer for 10 minutes" -> Verify native timer starts for 600 seconds.

## 7. Notes & To-Do
- [ ] **Create Note**: Say "Create a note: buy groceries tomorrow" -> Verify note app opens with text.

## 8. Camera & Gallery
- [ ] **Take Photo**: Say "Take a photo" -> Verify camera launches.
- [ ] **Open Gallery**: Say "Open gallery" -> Verify gallery opens.

## 9. Media, Music & Feed Scrolling
- [ ] **Play/Pause Media**: Say "Pause music" -> Verify system media key event pauses playback.
- [ ] **Adjust Volume**: Say "Set volume to 80%" -> Verify audio stream volume adjusts.
- [ ] **Insta Scroll**: Say "Scroll Instagram reels for 5 steps every 4 seconds" -> Verify agent launches Instagram, navigates feed/reels, and auto-swipes up every 4 seconds while maintaining omnipresent STOP control monitoring.

## 10. Maps & Navigation
- [ ] **Search Location**: Say "Find coffee shops nearby on Maps" -> Verify Google Maps opens with query.
- [ ] **Get Directions**: Say "Get directions to Central Park" -> Verify turn-by-turn navigation starts.

## 11. Shopping & Ride-Hailing
- [ ] **Search Product**: Say "Search for wireless headphones on Amazon" -> Verify app opens and searches query.
- [ ] **Checkout Safety Gate**: Attempt to proceed to checkout -> Verify agent detects payment/checkout screen, STOPS, and prompts for explicit user confirmation before any payment tap.

## 12. System Actions & Settings
- [ ] **Launch Installed App**: Say "Open WhatsApp" -> Verify package manager launches WhatsApp.
- [ ] **Toggle Radios**: Say "Turn on Wi-Fi" -> Verify Wi-Fi toggle or settings panel opens.
- [ ] **Omnipresent STOP Button**: Tap "STOP" on floating overlay while agent is performing an action -> Verify execution halts instantly.
- [ ] **Password/2FA Pause**: Navigate to a password login screen -> Verify agent detects password field and auto-pauses execution for manual user login.

## 13. Execution History Log
- [ ] Open Aurelia app -> Scroll to Execution History Log -> Verify step-by-step reviewable history of actions, timestamps, and status badges.
