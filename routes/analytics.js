const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const Attendance = require('../models/attendance');
const Player = require('../models/player');
const mongoose = require('mongoose');
const router = express.Router();

// @route   GET /api/analytics/dashboard
// @desc    Get dashboard statistics
// @access  Private
router.get('/dashboard', authMiddleware, async (req, res) => {
  try {
    // Get current month start and end dates
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    // Get total players
    const totalPlayers = await Player.countDocuments();

    // Get available players (always available)
    const availablePlayers = await Player.countDocuments({ alwaysAvailable: true });

    // Get attendance rate
    const players = await Player.find();
    let totalAttendance = 0;
    let totalSessions = 0;
    
    players.forEach(player => {
      totalAttendance += player.attendanceCount || 0;
      totalSessions += player.totalSessions || 0;
    });

    const attendanceRate = totalSessions > 0 
      ? Math.round((totalAttendance / totalSessions) * 100) 
      : 0;

    // Get sessions this month
    const sessionsThisMonth = await Attendance.aggregate([
      {
        $match: {
          date: { $gte: startOfMonth, $lte: endOfMonth }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
          sessions: { $addToSet: "$session" }
        }
      },
      {
        $project: {
          date: "$_id",
          sessionCount: { $size: "$sessions" },
          _id: 0
        }
      }
    ]);

    const totalSessionsThisMonth = sessionsThisMonth.reduce((sum, day) => sum + day.sessionCount, 0);

    res.json({
      totalPlayers,
      availablePlayers,
      attendanceRate: `${attendanceRate}%`,
      sessionsThisMonth: totalSessionsThisMonth
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/analytics/position
// @desc    Get attendance statistics by position
// @access  Private
router.get('/position', authMiddleware, async (req, res) => {
  try {
    const attendanceByPosition = await Player.aggregate([
      {
        $group: {
          _id: "$position",
          totalPlayers: { $sum: 1 },
          totalAttendanceCount: { $sum: "$attendanceCount" },
          totalSessions: { $sum: "$totalSessions" }
        }
      },
      {
        $project: {
          position: "$_id",
          totalPlayers: 1,
          attendanceRate: {
            $cond: {
              if: { $eq: ["$totalSessions", 0] },
              then: 0,
              else: { $multiply: [{ $divide: ["$totalAttendanceCount", "$totalSessions"] }, 100] }
            }
          },
          _id: 0
        }
      },
      {
        $sort: { attendanceRate: -1 }
      }
    ]);

    res.json(attendanceByPosition);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/analytics/weekly-trend
// @desc    Get weekly attendance trend
// @access  Private
router.get('/weekly-trend', authMiddleware, async (req, res) => {
  try {
    // Get last 5 weeks of data
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 35); // 5 weeks

    const weeklyTrend = await Attendance.aggregate([
      {
        $match: {
          date: { $gte: startDate, $lte: endDate },
          status: { $in: ["present", "late"] } // Count both present and late as attendance
        }
      },
      {
        $group: {
          _id: {
            year: { $isoWeekYear: "$date" },
            week: { $isoWeek: "$date" }
          },
          presentCount: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: "players",
          let: {},
          pipeline: [
            { $count: "totalPlayers" }
          ],
          as: "playerInfo"
        }
      },
      {
        $addFields: {
          totalPlayers: { $arrayElemAt: ["$playerInfo.totalPlayers", 0] }
        }
      },
      {
        $project: {
          week: "$_id.week",
          presentCount: 1,
          totalSessions: { $multiply: ["$totalPlayers", 7] }, // Assuming 7 sessions per week
          attendanceRate: {
            $multiply: [
              { $divide: ["$presentCount", { $multiply: ["$totalPlayers", 7] }] },
              100
            ]
          },
          _id: 0
        }
      },
      {
        $sort: { week: 1 }
      },
      {
        $limit: 5
      }
    ]);

    res.json(weeklyTrend);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/analytics/top-performers
// @desc    Get top performing players by attendance
// @access  Private
router.get('/top-performers', authMiddleware, async (req, res) => {
  try {
    const { limit = 6 } = req.query;

    const topPerformers = await Player.aggregate([
      {
        $match: {
          totalSessions: { $gt: 0 } // Only players who have attended at least one session
        }
      },
      {
        $addFields: {
          attendanceRate: {
            $cond: {
              if: { $eq: ["$totalSessions", 0] },
              then: 0,
              else: { $multiply: [{ $divide: ["$attendanceCount", "$totalSessions"] }, 100] }
            }
          }
        }
      },
      {
        $sort: { attendanceRate: -1 }
      },
      {
        $limit: parseInt(limit)
      },
      {
        $project: {
          name: 1,
          position: 1,
          jerseyNumber: 1,
          image: 1,
          attendanceCount: 1,
          totalSessions: 1,
          attendanceRate: { $round: ["$attendanceRate", 2] }
        }
      }
    ]);

    res.json(topPerformers);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/analytics/monthly-report/:year/:month
// @desc    Get monthly attendance report
// @access  Private
router.get('/monthly-report/:year/:month', authMiddleware, async (req, res) => {
  try {
    const { year, month } = req.params;
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    const monthlyReport = await Attendance.aggregate([
      {
        $match: {
          date: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
            session: "$session"
          },
          present: {
            $sum: { $cond: [{ $eq: ["$status", "present"] }, 1, 0] }
          },
          absent: {
            $sum: { $cond: [{ $eq: ["$status", "absent"] }, 1, 0] }
          },
          late: {
            $sum: { $cond: [{ $eq: ["$status", "late"] }, 1, 0] }
          }
        }
      },
      {
        $group: {
          _id: "$_id.date",
          sessions: {
            $push: {
              session: "$_id.session",
              present: "$present",
              absent: "$absent",
              late: "$late"
            }
          },
          totalPresent: { $sum: "$present" },
          totalAbsent: { $sum: "$absent" },
          totalLate: { $sum: "$late" }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    res.json(monthlyReport);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;