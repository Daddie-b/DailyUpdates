// server.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(express.json());
app.use(cors());

// Use an environment variable for the DB password, or replace '<db_password>' with your actual password.
const dbPassword = process.env.DB_PASSWORD || '<db_password>';
const mongoURI = `mongodb+srv://bill:${dbPassword}@mugomarbles.lhlc3hs.mongodb.net/MugoMarbles?retryWrites=true&w=majority&appName=MugoMarbles`;

// Connect to MongoDB
mongoose.connect(mongoURI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('MongoDB Connected'))
.catch(err => console.error(err));

// Import Routes
const rawMaterialsRoute = require('./routes/rawMaterials');
const productionRoute = require('./routes/production');

// Use Routes
app.use('/api/raw-materials', rawMaterialsRoute);
app.use('/api/production', productionRoute);

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
