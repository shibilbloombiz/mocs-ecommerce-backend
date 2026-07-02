const { z } = require("zod");

exports.registerSchema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().trim().email(),
  password: z.string().min(8).max(120),
});

exports.loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

exports.forgotSchema = z.object({ email: z.string().trim().email() });

exports.resetSchema = z.object({
  token: z.string().min(10),
  password: z.string().min(8).max(120),
});
