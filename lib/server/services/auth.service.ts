import bcrypt from "bcryptjs";
import { User } from "../models/User";
import { AppError } from "../utils/AppError";
import { signToken } from "../utils/token";
import type { AuthResponse, PublicUser, UserSettings } from "../types/index";

const SALT_ROUNDS = 10;

interface UserLike {
  _id: unknown;
  email: string;
  name: string;
  settings: UserSettings;
}

function toPublicUser(user: UserLike): PublicUser {
  return {
    id: String(user._id),
    email: user.email,
    name: user.name,
    settings: user.settings,
  };
}

export async function registerUser(
  email: string,
  password: string,
  name: string,
): Promise<AuthResponse> {
  const existing = await User.findOne({ email: email.toLowerCase() }).lean();

  if (existing) {
    throw new AppError("Bu email allaqachon ro'yxatdan o'tgan", 409);
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const user = await User.create({ email, name, passwordHash });

  return {
    token: signToken({ userId: String(user._id) }),
    user: toPublicUser(user as unknown as UserLike),
  };
}

export async function loginUser(
  email: string,
  password: string,
): Promise<AuthResponse> {
  const user = await User.findOne({ email: email.toLowerCase() }).select(
    "+passwordHash",
  );

  if (!user) {
    throw new AppError("Email yoki parol noto'g'ri", 401);
  }

  const matches = await bcrypt.compare(password, user.passwordHash);

  if (!matches) {
    throw new AppError("Email yoki parol noto'g'ri", 401);
  }

  return {
    token: signToken({ userId: String(user._id) }),
    user: toPublicUser(user as unknown as UserLike),
  };
}

export async function getUserProfile(userId: string): Promise<PublicUser> {
  const user = await User.findById(userId).lean();

  if (!user) {
    throw new AppError("Foydalanuvchi topilmadi", 404);
  }

  return toPublicUser(user as unknown as UserLike);
}

export async function updateUserSettings(
  userId: string,
  settings: Partial<UserSettings>,
): Promise<PublicUser> {
  const user = await User.findByIdAndUpdate(
    userId,
    { $set: Object.fromEntries(
      Object.entries(settings).map(([key, value]) => [`settings.${key}`, value]),
    ) },
    { new: true },
  ).lean();

  if (!user) {
    throw new AppError("Foydalanuvchi topilmadi", 404);
  }

  return toPublicUser(user as unknown as UserLike);
}
