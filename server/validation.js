import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().trim().email().max(254),
  name: z.string().trim().min(2).max(100),
  password: z.string().min(10).max(72).regex(/[a-z]/).regex(/[A-Z]/).regex(/\d/),
});

export const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(72),
});

export const addressSchema = z.object({
  label: z.string().trim().max(40).optional(),
  recipientName: z.string().trim().min(2).max(100),
  line1: z.string().trim().min(2).max(160),
  line2: z.string().trim().max(160).optional().nullable(),
  city: z.string().trim().min(2).max(80),
  state: z.string().trim().min(2).max(80),
  postalCode: z.string().trim().min(3).max(20),
  country: z.string().trim().length(2).default("US"),
  phone: z.string().trim().max(30).optional().nullable(),
  isDefault: z.boolean().optional(),
});

export const cartItemSchema = z.object({
  productId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().int().min(1).max(99),
});

export const guestCartSchema = z.object({
  items: z.array(cartItemSchema).max(100),
});

export const checkoutSchema = z.object({
  items: z.array(cartItemSchema).min(1).max(100),
  shippingAddress: addressSchema.omit({ label: true, isDefault: true }).extend({ country: z.string().length(2).default("US") }),
  idempotencyKey: z.string().min(8).max(100),
});

export const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().max(120).optional(),
  body: z.string().trim().max(3000).optional(),
});

export function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) {
    const error = new Error("Please check the submitted information.");
    error.statusCode = 400;
    error.details = result.error.flatten();
    throw error;
  }
  return result.data;
}
