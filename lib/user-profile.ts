import type { User } from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

export async function syncUserProfile(user: User) {
    if (!db) {
        return;
    }

    await setDoc(
        doc(db, "userProfiles", user.uid),
        {
            authEmail: user.email ?? "",
            authUid: user.uid,
            displayName: user.displayName ?? "",
            lastSeenAt: serverTimestamp(),
            photoURL: user.photoURL ?? "",
            providerIds: user.providerData.map((provider) => provider.providerId),
        },
        { merge: true },
    );
}
