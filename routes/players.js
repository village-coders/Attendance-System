const express = require('express');
const multer = require('multer');
const path = require('path');

const { authMiddleware } = require('../middleware/auth');
const Player = require('../models/player');
const { uploadToSupabase, deleteFromSupabase } = require('../middleware/supabase');
const Attendance = require('../models/attendance');
const router = express.Router();


// Configure multer for memory storage (we'll upload to Supabase directly)
const storage = multer.memoryStorage();

const upload = multer({
  storage: storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 5MB limit for Supabase
  fileFilter: function (req, file, cb) {
    const filetypes = /jpeg|jpg|png|webp|gif/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());

    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Only image files are allowed!'));
  }
});

// Helper function to upload image to Supabase


// Helper function to delete image from Supabase


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
router.post('/', authMiddleware, upload.single('image'), async (req, res) => {
  try {
    const { name, position, jerseyNumber, alwaysAvailable } = req.body;
    
    // Check if jersey number is already taken
    const existingPlayer = await Player.findOne({ jerseyNumber });
    if (existingPlayer) {
      return res.status(400).json({ message: 'Jersey number already taken' });
    }

    let imageUrl = null;
    
    // Upload image to Supabase if provided
    if (req.file) {
      imageUrl = await uploadToSupabase(req.file);
    }

    // Create player first to get ID for image naming
    const player = new Player({
      name,
      position,
      jerseyNumber,
      alwaysAvailable: alwaysAvailable === 'true' || alwaysAvailable === true,
      image: imageUrl
    });

    await player.save();
    
    // If image was uploaded, update with proper filename using player ID
    if (req.file && imageUrl) {
      // Re-upload with proper filename
      const newImageUrl = await uploadToSupabase(req.file, player._id);
      player.image = newImageUrl;
      await player.save();
    }

    res.status(201).json(player);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/players/:id
// @desc    Update a player
// @access  Private
router.put('/:id', authMiddleware, upload.single('image'), async (req, res) => {
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
      // Delete old image if exists
      if (currentPlayer.image) {
        await deleteFromSupabase(currentPlayer.image);
      }
      
      // Upload new image
      updateData.image = await uploadToSupabase(req.file, req.params.id);
    } else if (req.body.removeImage === 'true') {
      // Remove image if requested
      if (currentPlayer.image) {
        await deleteFromSupabase(currentPlayer.image);
      }
      updateData.image = null;
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
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const player = await Player.findById(req.params.id);
    if (!player) {
      return res.status(404).json({ message: 'Player not found' });
    }

    // Delete image from Supabase if exists
    if (player.image) {
      await deleteFromSupabase(player.image);
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
router.patch('/:id/availability', authMiddleware, async (req, res) => {
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