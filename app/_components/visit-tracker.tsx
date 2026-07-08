"use client";

import { onAuthStateChanged, type User } from "firebase/auth";
import {
    collection,
    doc,
    increment,
    serverTimestamp,
    setDoc,
} from "firebase/firestore";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { syncUserProfile } from "@/lib/user-profile";
import {
    detectVisitorEnvironment,
    makeDateKey,
    slugifySegment,
} from "@/lib/visitor";

export function VisitTracker() {
    const pathname = usePathname();
    const [user, setUser] = useState<User | null>(null);

    useEffect(() => {
        if (!auth) {
            return;
        }

        return onAuthStateChanged(auth, setUser);
    }, []);

    useEffect(() => {
        if (!user || !db || !pathname) {
            return;
        }

        void syncUserProfile(user);

        const dateKey = makeDateKey();
        const sessionKey = `visit:${user.uid}:${dateKey}:${pathname}`;

        if (window.sessionStorage.getItem(sessionKey)) {
            return;
        }

        window.sessionStorage.setItem(sessionKey, "1");

        const environment = detectVisitorEnvironment(window.navigator.userAgent);
        const pageKey = slugifySegment(pathname === "/" ? "home" : pathname);
        const docId = [
            user.uid,
            dateKey,
            pageKey,
            slugifySegment(environment.os),
            slugifySegment(environment.browser),
        ].join("__");

        void setDoc(
            doc(collection(db, "visitorInsights"), docId),
            {
                authEmail: user.email ?? "",
                authUid: user.uid,
                browser: environment.browser,
                count: increment(1),
                dateKey,
                deviceType: environment.deviceType,
                lastSeenAt: serverTimestamp(),
                os: environment.os,
                ownerName: user.displayName ?? "",
                path: pathname,
            },
            { merge: true },
        );
    }, [pathname, user]);

    return null;
}
