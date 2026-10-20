import { describe, it, expect } from "vitest";
import {
  isGeneralShoppingList,
  canDeleteShoppingList,
  arePromosEnabledForList,
  type ShoppingTripRef,
} from "@/lib/shopping";

describe("shopping list logic", () => {
  const generalTrip: ShoppingTripRef = {
    id: "trip-general-1",
    name: "Shopping",
    is_default: true,
    created_at: "2026-01-01T10:00:00Z",
  };

  const customTrip1: ShoppingTripRef = {
    id: "trip-costco-2",
    name: "Costco",
    is_default: false,
    created_at: "2026-01-02T10:00:00Z",
  };

  const customTrip2: ShoppingTripRef = {
    id: "trip-ikea-3",
    name: "IKEA",
    is_default: false,
    created_at: "2026-01-03T10:00:00Z",
  };

  const allTrips = [generalTrip, customTrip1, customTrip2];

  describe("isGeneralShoppingList", () => {
    it("identifies a trip with is_default=true as the general list", () => {
      expect(isGeneralShoppingList(generalTrip, allTrips)).toBe(true);
      expect(isGeneralShoppingList(customTrip1, allTrips)).toBe(false);
      expect(isGeneralShoppingList(customTrip2, allTrips)).toBe(false);
    });

    it("falls back to the earliest created trip if no trip has is_default=true", () => {
      const tripA: ShoppingTripRef = { id: "a", name: "Oldest", created_at: "2026-01-01T10:00:00Z" };
      const tripB: ShoppingTripRef = { id: "b", name: "Newer", created_at: "2026-01-02T10:00:00Z" };
      const tripsWithoutFlag = [tripA, tripB];

      expect(isGeneralShoppingList(tripA, tripsWithoutFlag)).toBe(true);
      expect(isGeneralShoppingList(tripB, tripsWithoutFlag)).toBe(false);
    });

    it("returns false for null/undefined or empty trips", () => {
      expect(isGeneralShoppingList(null, allTrips)).toBe(false);
      expect(isGeneralShoppingList(undefined, allTrips)).toBe(false);
      expect(isGeneralShoppingList({ id: "unknown" }, [])).toBe(false);
    });
  });

  describe("canDeleteShoppingList", () => {
    it("prevents deleting the general shopping list", () => {
      expect(canDeleteShoppingList(generalTrip, allTrips)).toBe(false);
    });

    it("allows deleting custom shopping lists", () => {
      expect(canDeleteShoppingList(customTrip1, allTrips)).toBe(true);
      expect(canDeleteShoppingList(customTrip2, allTrips)).toBe(true);
    });

    it("returns false for invalid trips", () => {
      expect(canDeleteShoppingList(null, allTrips)).toBe(false);
    });
  });

  describe("arePromosEnabledForList", () => {
    it("enables promos only for the general shopping list", () => {
      expect(arePromosEnabledForList(generalTrip, allTrips)).toBe(true);
      expect(arePromosEnabledForList(customTrip1, allTrips)).toBe(false);
      expect(arePromosEnabledForList(customTrip2, allTrips)).toBe(false);
    });
  });
});
