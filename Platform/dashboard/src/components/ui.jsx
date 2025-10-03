// src/components/ui.jsx
import React from "react";

const cx = (...cls) => cls.filter(Boolean).join(" ");

export function Card({ className = "", children, ...props }) {
  return (
    <div
      className={cx("bg-white border border-slate-200 rounded-2xl shadow-sm", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className = "", children, ...props }) {
  return (
    <div
      className={cx("px-5 py-4 border-b border-slate-200 rounded-t-2xl", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardTitle({ className = "", children, as: Tag = "h2", ...props }) {
  return (
    <Tag className={cx("text-lg font-semibold text-slate-800", className)} {...props}>
      {children}
    </Tag>
  );
}

export function CardBody({ className = "", children, ...props }) {
  return (
    <div className={cx("px-5 py-4 space-y-4", className)} {...props}>
      {children}
    </div>
  );
}

// Alias to satisfy both import styles across the app
export { CardBody as CardContent };

export function CardFooter({ className = "", children, ...props }) {
  return (
    <div
      className={cx(
        "px-5 py-3 border-t border-slate-200 rounded-b-2xl text-sm text-slate-600",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
