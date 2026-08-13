![Trek A Trip -- Your Itinerary Planner](frontend/src/assets/TrekATripLogo.png)

### Welcome to **Trek A Trip**, the ultimate tool for organizing your day, trip, or event with ease and clarity. Whether you're planning a vacation, a conference, or just your weekend, **Trek A Trip** helps you stay on track and in control.


## **Features**

### 🗓️ **Plan Your Trip**
Add activities with custom details like time, location, and notes.

### 🔄 **Update with Ease**
Change plans on the go. Update any part of your itinerary as your schedule evolves

### ❌ **Easy Deletion**
Remove activities that no longer fit your travel goals.

### 🤖 Built-In AI Travel Assistant
Ask our smart chatbot for trip planning advice, restaurant suggestions, weather tips, and more—right when you need it.

### 🔐 Personal & Public Trip Modes
Sign in to manage your private trips, or contribute to a shared public itinerary with others.

### 📍 Instant Directions to Your Phone
Get real-time Google Maps directions for each day’s plans, just one tap away.

### 📋 **Clean & Intuitive Interface**
Designed for simplicity and speed -- because planning should be fun, not frustrating.

## 👩‍💻 **Developers**
- Miriam Iny
- Sara Nechama Isenberg
- Temima Lewin
- Chana Leah Nissel

## 🛠️ **Development Stack**
This project uses React with Vite for a fast and modern frontend development experience, and Node.js for backend logic. It leverages AWS Lambda (via AWS SAM), Amazon DynamoDB and API Gateway to support a fully serverless architecture.

## 📥 **Installation**

#### To run the app locally, follow these steps:

### 1. Clone the repository
   ```bash
   git clone https://github.com/WITS2025/TripTrek.git
   cd TripTrek
   ```

### 2. Setup frontend
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
#### Steps 3 and 4 are optional

### 3. Setup backend
   
   Ensure you have AWS CLI and AWS SAM CLI installed.
   ```bash
   cd ../backend
   npm run install-all
   sam build
   sam deploy
   ```
### 4. Connect frontend to backend
   
   Update frontend/context/TripContext.jsx line 17 and frontend/context/TripContext.test.jsx line 6
   
   Set the API base URL to the deployed API Gateway URL from the SAM deploy output. Make sure to include the trailing slash.
   ```bash
   const API_Endpoint =  'https://your-api-endpoint.amazonaws.com/'
   ```

### Google Maps setup

The itinerary uses the Google Maps JavaScript API and its client-side geocoder.

1. In Google Cloud, use a project with billing enabled and enable:
   - Maps JavaScript API
   - Geocoding API
   - Places API (New)
   - Weather API
2. Create a browser API key and restrict it to websites (HTTP referrers):
   - `http://localhost:5173/*`
   - `https://trekatrip.com/*`
   - `https://www.trekatrip.com/*`
   - The Amplify domain, if it is used directly
3. Restrict the browser key to Maps JavaScript API, Geocoding API, and Places API (New).
4. For local development, create `frontend/.env.local`:
   ```env
   VITE_GOOGLE_MAPS_API_KEY=your_browser_key
   ```
5. For production, add `VITE_GOOGLE_MAPS_API_KEY` in the Amplify app's environment variables and redeploy the frontend.

6. Create a second server API key for Weather API only. Do not put it in Amplify or a `VITE_` variable. Store it in AWS Secrets Manager in `us-east-1` as `TrekATrip/google-maps-server`, then deploy the SAM backend. The weather Lambda is the only component permitted to read it.

Browser map keys are included in the built JavaScript and are inspectable. Never use an unrestricted key; the website and API restrictions are what protect it.

### AI Travel Assistant setup

Trekka calls OpenAI through the authenticated backend Lambda. Store the OpenAI key in AWS Secrets Manager as `TrekATrip/openai`; never add an OpenAI key to a `VITE_` variable or frontend file.

### Amazon SES email setup

Contact messages and trip-sharing invitations are sent by backend Lambdas; SES credentials are never exposed to the frontend.

1. In Amazon SES `us-east-1`, verify `trekatrip.com`, enable DKIM, and request production access.
2. Deploy with a verified sender under that domain and a private contact inbox:
   ```bash
   sam deploy --parameter-overrides \
     ImageUploadBucket=trek-a-trip-images-bucket \
     CognitoUserPoolId=us-east-1_Ks6i9yln5 \
     CognitoUserPoolClientId=3n8imnlps0an3lj9rp2umi7bu6 \
     SesIdentityName=trekatrip.com \
     SesSenderEmail=hello@trekatrip.com \
     ContactRecipientEmail=your-private-email@example.com \
     AppBaseUrl=https://www.trekatrip.com
   ```
3. For GitHub Actions deployment, create the repository secret `CONTACT_RECIPIENT_EMAIL`. The workflow passes it to CloudFormation without committing it.
4. Keep the Amplify single-page-app rewrite configured so email links to `/trips` serve `index.html` rather than returning a 404.

The public contact endpoint validates and escapes input, uses a bot honeypot, and limits each source IP to five submissions per hour. The invite endpoint remains Cognito-authenticated.

### Cognito and Google account linking

The `cognitoAccountLinker` Lambda links a first Google sign-in to one canonical native Cognito profile when Google supplies a verified email. The canonical Cognito `sub` remains stable so trips and sharing permissions continue to belong to the same account. Google sign-in refreshes the mapped `name` and `picture` attributes.

After deploying the SAM stack, attach the function in the Cognito console:

1. Open user pool `us-east-1_Ks6i9yln5` in `us-east-1`.
2. Open **Extensions → Lambda triggers → Add a Lambda trigger**.
3. Choose **Sign-up → Pre sign-up**.
4. Select `cognitoAccountLinker`, then save.

Do not attach it with a partial `update-user-pool` CLI call. Cognito resets omitted user-pool settings to their defaults. Existing federated profiles that have already completed Google sign-in are not linked retroactively; migrate their DynamoDB ownership and Cognito profiles separately before deleting anything.

## 📌 **Why Trek A Trip?**
### Because life is better when it's organized. Whether you're a meticulous planner or a spontaneous adventurer, **Trek A Trip** gives you the flexibility to build and adjust your itinerary on the fly.
