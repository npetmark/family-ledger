import * as LucideIcons from "lucide-react";
import { LucideProps } from "lucide-react";

// Map of icon name strings to Lucide components
const iconMap: Record<string, React.ComponentType<LucideProps>> = {
  "home": LucideIcons.Home,
  "shopping-cart": LucideIcons.ShoppingCart,
  "zap": LucideIcons.Zap,
  "car": LucideIcons.Car,
  "shield": LucideIcons.Shield,
  "utensils": LucideIcons.Utensils,
  "film": LucideIcons.Film,
  "shopping-bag": LucideIcons.ShoppingBag,
  "palette": LucideIcons.Palette,
  "piggy-bank": LucideIcons.PiggyBank,
  "trending-up": LucideIcons.TrendingUp,
  "landmark": LucideIcons.Landmark,
  "wallet": LucideIcons.Wallet,
  "building": LucideIcons.Building,
  "banknote": LucideIcons.Banknote,
  "credit-card": LucideIcons.CreditCard,
  "coins": LucideIcons.Coins,
  "circle": LucideIcons.Circle,
  "heart": LucideIcons.Heart,
  "star": LucideIcons.Star,
  "gift": LucideIcons.Gift,
  "briefcase": LucideIcons.Briefcase,
  "phone": LucideIcons.Phone,
  "wifi": LucideIcons.Wifi,
  "music": LucideIcons.Music,
  "book": LucideIcons.Book,
  "plane": LucideIcons.Plane,
  "coffee": LucideIcons.Coffee,
  "baby": LucideIcons.Baby,
  "stethoscope": LucideIcons.Stethoscope,
  "graduation-cap": LucideIcons.GraduationCap,
  "dumbbell": LucideIcons.Dumbbell,
  "sparkles": LucideIcons.Sparkles,
  "bus": LucideIcons.Bus,
  "ticket": LucideIcons.Ticket,
  "help-circle": LucideIcons.HelpCircle,
  "tag": LucideIcons.Tag,
  "shirt": LucideIcons.Shirt,
  "gem": LucideIcons.Gem,
};

export function DynamicIcon({ name, ...props }: { name: string } & LucideProps) {
  const IconComponent = iconMap[name] || LucideIcons.Circle;
  return <IconComponent {...props} />;
}

export const availableIcons = Object.keys(iconMap);
