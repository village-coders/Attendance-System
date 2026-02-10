const express = require('express');
const multer = require('multer');
const path = require('path');

const { authMiddleware, isCoach } = require('../middleware/auth');
const Player = require('../models/player');
const uploadPlayerImage = require('../middleware/multer');

const Attendance = require('../models/attendance');
const router = express.Router();




// @route   GET /api/players
// @desc    Get all players
// @access  Private
router.get('/', authMiddleware, async (req, res) => {
  try {
    const players = await Player.find().sort({ name: 1 });
    res.json(players);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/players/:id
// @desc    Get player by ID
// @access  Private
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const player = await Player.findById(req.params.id);
    if (!player) {
      return res.status(404).json({ message: 'Player not found' });
    }
    res.json(player);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/players
// @desc    Create a new player
// @access  Private
router.post('/', authMiddleware, isCoach, uploadPlayerImage.single('image'), async (req, res) => {
  try {
    const { name, position, jerseyNumber, alwaysAvailable } = req.body;
    
    // Check if jersey number is already taken
    const existingPlayer = await Player.findOne({ jerseyNumber });
    if (existingPlayer) {
      return res.status(400).json({ message: 'Jersey number already taken' });
    }

    const image = req.file.path


    if(!image){
      return res.status(400).json({ message: 'No file uploaded' });
    }

    // Create player first to get ID for image naming
    const player = new Player({
      name,
      position, 
      jerseyNumber,
      alwaysAvailable: alwaysAvailable === 'true' || alwaysAvailable === true,
      image: image
    });

    await player.save();
    

    res.status(201).json(player);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/players/:id
// @desc    Update a player
// @access  Private
router.put('/:id', authMiddleware, isCoach, uploadPlayerImage.single('image'), async (req, res) => {
  try {
    const { name, position, jerseyNumber, alwaysAvailable } = req.body;
    
    // Check if jersey number is taken by another player
    if (jerseyNumber) {
      const existingPlayer = await Player.findOne({ 
        jerseyNumber, 
        _id: { $ne: req.params.id } 
      });
      if (existingPlayer) {
        return res.status(400).json({ message: 'Jersey number already taken' });
      }
    }

    // Get current player to check for existing image
    const currentPlayer = await Player.findById(req.params.id);
    if (!currentPlayer) {
      return res.status(404).json({ message: 'Player not found' });
    }

    const updateData = {
      name,
      position,
      jerseyNumber,
      alwaysAvailable: alwaysAvailable === 'true' || alwaysAvailable === true,
      updatedAt: Date.now()
    };

    // Handle image upload
    if (req.file) {
      // Upload new image
      updateData.image = req.file?.path
    }

    const player = await Player.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    res.json(player);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/players/:id
// @desc    Delete a player
// @access  Private
router.delete('/:id', authMiddleware, isCoach, async (req, res) => {
  try {
    const player = await Player.findById(req.params.id);
    if (!player) {
      return res.status(404).json({ message: 'Player not found' });
    }


    await Attendance.deleteMany({ playerId: req.params.id });



    // Delete player from database
    await Player.findByIdAndDelete(req.params.id);
    
    res.json({ message: 'Player deleted successfully' });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PATCH /api/players/:id/availability
// @desc    Update player availability
// @access  Private
router.patch('/:id/availability', authMiddleware, isCoach, async (req, res) => {
  try {
    const { alwaysAvailable } = req.body;
    
    const player = await Player.findByIdAndUpdate(
      req.params.id,
      { alwaysAvailable },
      { new: true, runValidators: true }
    );
    
    if (!player) {
      return res.status(404).json({ message: 'Player not found' });
    }
    
    res.json(player);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;