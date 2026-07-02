const asyncHandler = require("express-async-handler");
const Settings = require("../models/Settings");

// GET /api/settings/:key
exports.getSettings = asyncHandler(async (req, res) => {
  const setting = await Settings.findOne({ key: req.params.key });
  if (!setting) {
    return res.json({ key: req.params.key, value: null });
  }
  res.json(setting);
});

// PUT /api/settings/:key
exports.updateSettings = asyncHandler(async (req, res) => {
  const { value } = req.body;
  let setting = await Settings.findOne({ key: req.params.key });
  if (setting) {
    setting.value = value;
    await setting.save();
  } else {
    setting = await Settings.create({ key: req.params.key, value });
  }
  res.json(setting);
});
