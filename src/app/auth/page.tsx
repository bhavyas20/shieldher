import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowRight, Scale, Shield, ShieldCheck, Sparkles, UserRound } from 'lucide-react';
import styles from './page.module.css';
import AuthThreeBackground from '@/components/auth/AuthThreeBackground';

export const metadata: Metadata = {
  title: 'Choose Login Type - ShieldHer',
  description: 'Choose whether you want to continue as a user or lawyer.',
};

export default function AuthPage() {
  return (
    <div className={styles.wrapper}>
      <div className={styles.sceneLayer}>
        <AuthThreeBackground />
      </div>
      <div className={styles.glowOrbA} aria-hidden="true" />
      <div className={styles.glowOrbB} aria-hidden="true" />
      <div className={styles.floatingRingOne} aria-hidden="true" />
      <div className={styles.floatingRingTwo} aria-hidden="true" />
      <div className={styles.ambientGrid} aria-hidden="true" />
      <div className={styles.lightSweep} aria-hidden="true" />
      <div className={styles.particleLayer} aria-hidden="true" />
      <div className={styles.noiseLayer} aria-hidden="true" />

      <div className={styles.card}>
        <div className={styles.cardAmbient} aria-hidden="true" />
        <div className={styles.cardAurora} aria-hidden="true" />
        <div className={styles.cardEdgePulse} aria-hidden="true" />
        <div className={styles.cardSparkle} aria-hidden="true" />
        <div className={styles.cardScanline} aria-hidden="true" />
        <div className={styles.cardSheen} aria-hidden="true" />
        <div className={styles.header}>
          <h1 className={styles.title}>Choose Login Type</h1>
          <p className={styles.subtitle}>
            Select how you want to continue to the signup page.
          </p>
          <div className={styles.featureStrip}>
            <span className={styles.featureChip}>
              <ShieldCheck size={12} />
              User Safety Tools
            </span>
            <span className={styles.featureChip}>
              <ShieldCheck size={12} />
              Lawyer Workspace
            </span>
            <span className={styles.featureChip}>
              <ShieldCheck size={12} />
              Secure Verification
            </span>
          </div>
        </div>

        <div className={styles.options}>
          <Link href="/auth/signup?role=user" className={styles.optionCard}>
            <div className={styles.optionIcon}>
              <UserRound size={20} />
            </div>
            <div className={styles.optionText}>
              <h2>User Login</h2>
              <p>Continue as an individual user</p>
            </div>
            <ArrowRight size={18} className={styles.optionArrow} />
          </Link>

          <Link href="/auth/signup?role=lawyer" className={styles.optionCard}>
            <div className={styles.optionIcon}>
              <Scale size={20} />
            </div>
            <div className={styles.optionText}>
              <h2>Lawyer Login</h2>
              <p>Continue as a legal professional</p>
            </div>
            <ArrowRight size={18} className={styles.optionArrow} />
          </Link>
        </div>
      </div>
    </div>
  );
}
