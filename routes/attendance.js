const express = require('express');
const { authMiddleware, isCoach } = require('../middleware/auth');
const Attendance = require('../models/attendance');
const Player = require('../models/player');
const router = express.Router();

// @route   GET /api/attendance
// @desc    Get attendance records with filters
// @access  Private
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { date, session, playerId } = req.query;
    let query = {};

    if (date) {
      const startDate = new Date(date);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(date);
      endDate.setHours(23, 59, 59, 999);
      query.date = { $gte: startDate, $lte: endDate };
    }

    if (session) {
      query.session = session;
    }

    if (playerId) {
      query.playerId = playerId;
    }

    const attendance = await Attendance.find(query)
      .populate('playerId', 'name position jerseyNumber')
      .populate('recordedBy', 'name')
      .sort({ date: -1, session: 1 });

    res.status(200).json(attendance);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/attendance
// @desc    Mark attendance for players
// @access  Private
router.post('/', authMiddleware, isCoach, async (req, res) => {
  try {
    const { date, session, attendanceData } = req.body;

    const results = [];
    const errors = [];



    for (const item of attendanceData) {
      try {
        // Check if attendance already exists for this player, date, and session
        const existingAttendance = await Attendance.findOne({
          playerId: item.playerId,
          date: new Date(date),
          session
        });

        if (existingAttendance) {
          // Update existing attendance
          existingAttendance.status = item.status;
          existingAttendance.recordedBy = req.user.id;
          await existingAttendance.save();
          results.push(existingAttendance);
        } else {
          // Create new attendance record
          const attendance = new Attendance({
            playerId: item.playerId,
            date: new Date(date),
            session,
            status: item.status,
            recordedBy: req.user.id
          });
          await attendance.save();
          results.push(attendance);

          // Update player's attendance count if present or late
          if (item.status === 'present' || item.status === 'late') {
            await Player.findByIdAndUpdate(item.playerId, {
              $inc: { attendanceCount: 1, totalSessions: 1 }
            });
          } else if (item.status === 'absent') {
            await Player.findByIdAndUpdate(item.playerId, {
              $inc: { totalSessions: 1 }
            });
          }
        }
      } catch (err) {
        errors.push({
          playerId: item.playerId,
          error: err.message
        });
      }
    }

    res.status(201).json({
      message: `Attendance recorded for ${results.length} players`,
      results,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/attendance/summary/:date
// @desc    Get attendance summary for a specific date
// @access  Private
router.get('/summary/:date', authMiddleware, async (req, res) => {
  try {
    const date = new Date(req.params.date);
    const startDate = new Date(date);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(date);
    endDate.setHours(23, 59, 59, 999);

    // Get all attendance for the date
    const attendance = await Attendance.find({
      date: { $gte: startDate, $lte: endDate }
    });

    // Calculate summary
    const summary = {
      present: 0,
      absent: 0,
      late: 0,
      morning: { present: 0, absent: 0, late: 0 },
      afternoon: { present: 0, absent: 0, late: 0 },
      evening: { present: 0, absent: 0, late: 0 }
    };

    attendance.forEach(record => {
      summary[record.status]++;
      summary[record.session][record.status]++;
    });

    res.json(summary);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/attendance/player/:playerId
// @desc    Get attendance history for a specific player
// @access  Private
router.get('/player/:playerId', authMiddleware, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    let query = { playerId: req.params.playerId };

    if (startDate && endDate) {
      query.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const attendance = await Attendance.find(query)
      .sort({ date: -1, session: 1 })
      .populate('recordedBy', 'name');

    // Calculate player statistics
    const totalRecords = attendance.length;
    const presentCount = attendance.filter(a => a.status === 'present').length;
    const lateCount = attendance.filter(a => a.status === 'late').length;
    const absentCount = attendance.filter(a => a.status === 'absent').length;

    res.json({
      attendance,
      statistics: {
        totalRecords,
        presentCount,
        lateCount,
        absentCount,
        attendanceRate: totalRecords > 0 ? Math.round((presentCount + lateCount) / totalRecords * 100) : 0
      }
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;