"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

export type CartItem = {
    id: number;
    name: string;
    image_url?: string;
    price: number;
    quantity: number;
    tax_rate: number;
    delivery_charge?: number | null;
};

type CartContextType = {
    items: CartItem[];
    addItem: (item: CartItem) => void;
    removeItem: (id: number) => void;
    updateQuantity: (id: number, quantity: number) => void;
    clearCart: () => void;
    cartTotal: number;
    deliveryTotal: number;
};

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children, companyId }: { children: React.ReactNode; companyId: string }) {
    const [items, setItems] = useState<CartItem[]>([]);
    const [isLoaded, setIsLoaded] = useState(false);

    const storageKey = `cart_items_${companyId}`;

    useEffect(() => {
        const stored = localStorage.getItem(storageKey);
        if (stored) {
            try {
                setItems(JSON.parse(stored));
            } catch (e) {
                console.error("Failed to parse cart", e);
            }
        }
        setIsLoaded(true);
    }, [storageKey]);

    useEffect(() => {
        if (isLoaded) {
            localStorage.setItem(storageKey, JSON.stringify(items));
        }
    }, [items, isLoaded, storageKey]);

    const addItem = (newItem: Omit<CartItem, "quantity"> & { quantity?: number }) => {
        const qty = newItem.quantity || 1;
        setItems(prev => {
            const existing = prev.find(i => i.id === newItem.id);
            if (existing) {
                return prev.map(i => i.id === newItem.id ? { ...i, quantity: i.quantity + qty } : i);
            }
            return [...prev, { ...newItem, quantity: qty }];
        });
    };

    const removeItem = (id: number) => {
        setItems(prev => prev.filter(i => i.id !== id));
    };

    const updateQuantity = (id: number, quantity: number) => {
        if (quantity < 1) return removeItem(id);
        setItems(prev => prev.map(i => i.id === id ? { ...i, quantity } : i));
    };

    const clearCart = () => {
        setItems([]);
    };

    const cartTotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    // Using max delivery charge as a simple flat fee strategy.
    const deliveryTotal = items.reduce((max, item) => Math.max(max, item.delivery_charge || 0), 0);

    return (
        <CartContext.Provider value={{ items, addItem, removeItem, updateQuantity, clearCart, cartTotal, deliveryTotal }}>
            {children}
        </CartContext.Provider>
    );
}

export function useCart() {
    const context = useContext(CartContext);
    if (context === undefined) {
        throw new Error("useCart must be used within a CartProvider");
    }
    return context;
}
