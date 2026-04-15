import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabaseUrl = 'https://tjxreolqbbqmbjkefmpe.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqeHJlb2xxYmJxbWJqa2VmbXBlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxNjYyNDgsImV4cCI6MjA5MTc0MjI0OH0.aBVrTywm4D4XX6vYahcL3eFYTnLLVJu6OG4LAIZ4U-U';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const PRESET_ACTIVITIES = [
  'Work', 'Meeting', 'Email', 'Deep work', 'Admin',
  'Social', 'Family time', 'Friend catch-up', 'Party', 'Date',
  'Exercise', 'Walk', 'Gym', 'Sport', 'Yoga',
  'Rest', 'Nap', 'TV', 'Reading', 'Gaming',
  'Meal', 'Cooking', 'Eating out', 'Coffee',
  'Creative', 'Writing', 'Art', 'Music'
];

const ThreePotTracker = () => {
  // Auth state
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authMode, setAuthMode] = useState('login'); // 'login' or 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');

  // Tracker state
  const [physicalPot, setPhysicalPot] = useState(50);
  const [cognitivePot, setCognitivePot] = useState(50);
  const [emotionalPot, setEmotionalPot] = useState(50);
  const [selectedTags, setSelectedTags] = useState([]);
  const [customTag, setCustomTag] = useState('');
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [breakdownValues, setBreakdownValues] = useState({});
  const [history, setHistory] = useState([]);
  const [activityPatterns, setActivityPatterns] = useState({});
  const [showHistory, setShowHistory] = useState(false);
  const [showReference, setShowReference] = useState(false);
  const [openRefPots, setOpenRefPots] = useState(new Set());
  const [openRefZones, setOpenRefZones] = useState(new Set());
  const [warningMessages, setWarningMessages] = useState([]);
  const [showWarningModal, setShowWarningModal] = useState(false);

  const [activitySearch, setActivitySearch] = useState('');
  const [allActivities, setAllActivities] = useState(PRESET_ACTIVITIES);

  // Check for existing session on mount
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Load user data when logged in
  useEffect(() => {
    if (user) {
      loadUserData();
    }
  }, [user]);

  const loadUserData = async () => {
    try {
      // Load check-ins history
      const { data: checkIns, error: checkInsError } = await supabase
        .from('check_ins')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (checkInsError) throw checkInsError;

      setHistory(checkIns || []);

      // Load activity patterns
      const { data: patterns, error: patternsError } = await supabase
        .from('activity_patterns')
        .select('*')
        .eq('user_id', user.id);

      if (patternsError) throw patternsError;

      const patternsObj = {};
      patterns?.forEach(p => {
        patternsObj[p.activity_name] = {
          physical: parseFloat(p.physical_impact_avg || 0),
          cognitive: parseFloat(p.cognitive_impact_avg || 0),
          emotional: parseFloat(p.emotional_impact_avg || 0),
          count: p.frequency
        };
      });
      setActivityPatterns(patternsObj);

      // Load global custom activities
      const { data: customActivities } = await supabase
        .from('custom_activities')
        .select('name')
        .order('name');

      if (customActivities?.length) {
        const customNames = customActivities.map(a => a.name);
        setAllActivities([
          ...PRESET_ACTIVITIES,
          ...customNames.filter(n => !PRESET_ACTIVITIES.includes(n))
        ]);
      }

    } catch (error) {
      console.error('Error loading user data:', error);
    }
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    setAuthError('');
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });
      if (error) throw error;
      alert('Check your email for the confirmation link!');
    } catch (error) {
      setAuthError(error.message);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setAuthError('');
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
    } catch (error) {
      setAuthError(error.message);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const saveCheckIn = async () => {
    if (!user) return;

    const activities = [...selectedTags];
    if (customTag.trim()) {
      activities.push(customTag.trim());
    }

    try {
      // Save check-in
      const { error: checkInError } = await supabase
        .from('check_ins')
        .insert([{
          user_id: user.id,
          physical_level: physicalPot,
          cognitive_level: cognitivePot,
          emotional_level: emotionalPot,
          activities: activities
        }]);

      if (checkInError) throw checkInError;

      // Update activity patterns
      for (const activity of activities) {
        const existing = activityPatterns[activity];
        const newData = {
          user_id: user.id,
          activity_name: activity,
          frequency: (existing?.count || 0) + 1
        };

        // For now, we're not calculating impact deltas - that requires comparing to previous state
        // This is a simplified version - can enhance later

        const { error: patternError } = await supabase
          .from('activity_patterns')
          .upsert(newData, {
            onConflict: 'user_id,activity_name'
          });

        if (patternError) throw patternError;
      }

      // Reload data
      await loadUserData();

      // Check for warnings
      checkWarnings(physicalPot, cognitivePot, emotionalPot);

      // Clear form
      setSelectedTags([]);
      setCustomTag('');
      setShowBreakdown(false);
      setBreakdownValues({});

    } catch (error) {
      console.error('Error saving check-in:', error);
      alert('Error saving check-in. Please try again.');
    }
  };

  const checkWarnings = (physical, cognitive, emotional) => {
    const warnings = [];
    
    if (physical <= 5) {
      warnings.push({
        pot: 'Physical',
        level: physical,
        title: 'Physical Shutdown',
        severity: 'crisis',
        emoji: '🔴',
        whatHappening: 'Your body has hit its limit and is protectively shutting down until capacity is restored.',
        whatNeeded: 'Immediate rest and refuel. Sleep, eat, reduce physical demands. Non-essential tasks should be postponed.',
        warningHeader: 'Physical Crisis!',
        warningBody: 'Focused recovery can alleviate shutdown quickly if you listen to your body.',
        context: 'Likely experiencing sleep debt, under-eating, and/or sustained physical demands without recovery if shutdown is chronic.'
      });
    } else if (physical <= 20) {
      warnings.push({
        pot: 'Physical',
        level: physical,
        title: 'Physical Depletion',
        severity: 'crisis-imminent',
        emoji: '🔴',
        whatHappening: 'Physical reserves are low. High chance of shutdown. Your performance is impacted across the board.',
        whatNeeded: 'Stop pushing through, reassess upcoming week. Prioritize sleep quality and quantity. Regular meals. Accept the increased recovery time, add buffers into your day.',
        warningHeader: 'Physical Depletion!',
        warningBody: 'Tasks are currently lower quality and taking longer. Trying to push through is false economy and will cause crash.'
      });
    } else if (physical <= 40) {
      warnings.push({
        pot: 'Physical',
        level: physical,
        title: 'Physical Tiring',
        severity: 'caution',
        emoji: '🟡',
        whatHappening: 'Physical fatigue building. Body is starting to signal need for rest and recovery.',
        whatNeeded: 'Start wrapping up tasks for the day. Ensure physically restorative/neutral tasks before further drain. Sleep, eat, be still.',
        caution: 'Check in with patterns and plans',
        context: 'Natural to reach this state later in the day. Problematic if appearing early or without exertion. Possible to push through when needed (deadlines, etc), however will lead to depletion and/or shutdown if this is sustained.'
      });
    }

    if (cognitive <= 5) {
      warnings.push({
        pot: 'Cognitive',
        level: cognitive,
        title: 'Cognitive Shutdown',
        severity: 'crisis',
        emoji: '🔴',
        whatHappening: 'Brain capacity hit limit. Struggling to understand/retain info. Simple decisions overwhelming or blank. Just want to not think.',
        whatNeeded: 'Immediate cognitive rest/simplicity/support. No decisions, problem-solving, or planning. Outsource thinking. Routine/repetitive tasks may help.',
        warningHeader: 'Cognitive Crisis!',
        warningBody: 'This is protective shutdown - your brain needs to replenish neurotransmitters, energy, and potentially do some repairs.'
      });
    } else if (cognitive <= 20) {
      warnings.push({
        pot: 'Cognitive',
        level: cognitive,
        title: 'Cognitive Depletion',
        severity: 'crisis-imminent',
        emoji: '🔴',
        whatHappening: 'Cognitive reserves low. High chance of shutdown. Slower thinking. Cognitive mistakes common - forgetfulness, muddling words, decreased attention capacity.',
        whatNeeded: 'Reduce complexity and cognitive load. Recovery activities using other capacities. Simplify decisions, use checklists, rely on routines (you cannot create them now). Accept increased processing time.',
        warningHeader: 'Cognitive Depletion!',
        warningBody: 'Shutdown is coming if ignored - rest now costs less than crash later.'
      });
    } else if (cognitive <= 40) {
      warnings.push({
        pot: 'Cognitive',
        level: cognitive,
        title: 'Cognitive Tiring',
        severity: 'caution',
        emoji: '🟡',
        whatHappening: 'Mental fatigue building. Concentration waning.',
        whatNeeded: 'Relaxation, entertainment, familiarity. Start winding down cognitive work. Switch to cognitively neutral/restorative activities.',
        caution: 'Check in with patterns and plans',
        context: 'Natural late-day state. Problematic if appearing early or without cognitive exertion. Can push through short-term (meetings, deadlines) but leads to depletion if prolonged.'
      });
    }

    if (emotional <= 5) {
      warnings.push({
        pot: 'Emotional/Sensory',
        level: emotional,
        title: 'Emotional/Sensory Shutdown',
        severity: 'crisis',
        emoji: '🔴',
        whatHappening: 'Nervous system hit limit. Cannot filter or respond appropriately to sensory/emotional input. Protective shutdown engaged.',
        whatNeeded: 'Permission to withdrawal (guilt-free). Control of sensory/emotional inputs. No or gentle supportive interactions.',
        warningHeader: 'Emotional/Sensory Crisis!',
        warningBody: 'This is protective - your nervous system needs to escape being stuck in threat response. Rapid recovery is possible with correct conditions.'
      });
    } else if (emotional <= 20) {
      warnings.push({
        pot: 'Emotional/Sensory',
        level: emotional,
        title: 'Emotional/Sensory Depletion',
        severity: 'crisis-imminent',
        emoji: '🔴',
        whatHappening: 'Close to emotional/sensory limit. Heightened sensitivity to stimuli. Emotional instability (big/no reactions). "Sticky" negative triggers.',
        whatNeeded: 'Reduce sensory and emotional load. Quiet, familiar, low-demand environments. Minimize social interactions requiring any sort of masking/difficulty. Give yourself permission to say no, cancel plans, or otherwise simplify.',
        warningHeader: 'Emotional/Sensory Depletion!',
        warningBody: 'Shutdown will result from pushing through - recovery now is less costly overall.'
      });
    } else if (emotional <= 40) {
      warnings.push({
        pot: 'Emotional/Sensory',
        level: emotional,
        title: 'Emotional/Sensory Tiring',
        severity: 'caution',
        emoji: '🟡',
        whatHappening: 'Emotional/sensory capacity emptying. Emotional responses dulled or heightened. Sensory sensitivities less tolerable.',
        whatNeeded: 'Be intentional regarding emotionally demanding activities. Reduce social/sensory load where possible, prioritise activities likely to be pleasant and gentle emotionally/sensorily.',
        caution: 'Check in with patterns and plans',
        context: 'Natural late-day state. Problematic if appearing early or without demands. Can push through short-term but leads to depletion if sustained.'
      });
    }

    if (warnings.length > 0) {
      setWarningMessages(warnings);
      setShowWarningModal(true);
    }
  };

  const toggleTag = (tag) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const addCustomActivity = async (name) => {
    const trimmed = name.trim();
    if (!trimmed) return;

    // Save to Supabase so all users can see it
    await supabase
      .from('custom_activities')
      .upsert({ name: trimmed, created_by: user.id }, { onConflict: 'name' });

    // Add to local list if not already there
    setAllActivities(prev => prev.includes(trimmed) ? prev : [...prev, trimmed]);

    // Select it and clear search
    setSelectedTags(prev => prev.includes(trimmed) ? prev : [...prev, trimmed]);
    setActivitySearch('');
  };

  const addCustomTag = () => {
    if (customTag.trim() && !selectedTags.includes(customTag.trim())) {
      setSelectedTags(prev => [...prev, customTag.trim()]);
      setCustomTag('');
    }
  };

  const getZoneInfo = (level) => {
    if (level <= 5) return { name: 'Shutdown', color: '#8B0000', textColor: '#fff' };
    if (level <= 20) return { name: 'Depleted', color: '#DC143C', textColor: '#fff' };
    if (level <= 40) return { name: 'Tiring', color: '#FF6B35', textColor: '#fff' };
    if (level <= 60) return { name: 'Neutral', color: '#FFD93D', textColor: '#333' };
    if (level <= 80) return { name: 'Resourced', color: '#6BCF7F', textColor: '#333' };
    return { name: 'Energised', color: '#2D6A4F', textColor: '#fff' };
  };

  const getTooltipText = (pot, level) => {
    const zone = getZoneInfo(level);
    const tooltips = {
      Physical: {
        'Shutdown': 'Bodily exhaustion • Simple movements draining • Pull toward stillness • Body heavy\nBody has hit limit - physical tasks require conscious effort to initiate and sustain',
        'Depleted': 'Deep tiredness • Heavy movements, clumsy • Heavy eyes\nBodily fatigue preventing initiating or completing tasks',
        'Tiring': 'Wanting rest • Slight heaviness • Slowing pace\nMild resistance to physical effort, reduced performance',
        'Neutral': 'Baseline functioning - be intentional',
        'Resourced': 'Good capacity - functioning well',
        'Energised': 'High capacity - can handle unexpected demands'
      },
      Cognitive: {
        'Shutdown': 'Mental exhaustion • Decision paralysis severe • Blanking mid-task/sentence\nBrain hit limit - directing thinking is highly effortful and unsustainable',
        'Depleted': 'Brain slow, foggy • Frequent mistakes • Re-reading sentences • Forgetfulness\nMental resistance or confusion around decisions/tasks blocking productivity',
        'Tiring': 'Seeking simplicity • Attention drifting • Information overload more common\nMild resistance to mental effort, procrastination/distraction increasing',
        'Neutral': 'Baseline functioning - be intentional',
        'Resourced': 'Good capacity - functioning well',
        'Energised': 'High capacity - can handle unexpected demands'
      },
      'Emotional/Sensory': {
        'Shutdown': 'Total overwhelm • Internal/external space "too loud" or blank • Want to \'tear off skin\'\nNervous system hit limit - fight/flight/freeze taken over, overriding this highly effortful',
        'Depleted': 'Loss of nuance • Triggers: Sensory = painful, Emotional = threat • Overwhelm common\nMotivation lacking for initiation. Negative thoughts are \'sticky\' and derailing effort.',
        'Tiring': 'Pull towards quiet, calm, familiarity • Greater reactivity to irritants and challenges\nMild resistance to activities perceived as emotionally heavy or sensorily busy/loud',
        'Neutral': 'Baseline functioning - be intentional',
        'Resourced': 'Good capacity - functioning well',
        'Energised': 'High capacity - can handle unexpected demands'
      }
    };
    return tooltips[pot][zone.name];
  };

  const renderTooltipText = (pot, level) => {
    const text = getTooltipText(pot, level);
    const [bulletLine, descLine] = text.split('\n');
    const [first, ...rest] = bulletLine.split(' • ');
    const bullets = [first, ...rest.sort((a, b) => a.length - b.length)];
    const dividerColor = level <= 5 ? '#dc2626' : level <= 20 ? '#f87171' : level <= 40 ? '#fbbf24' : '#d1d5db';
    return (
      <>
        <div>
          {bullets.map((bullet, i) => (
            <span key={i}>
              {i > 0 ? ' ' : ''}
              <span style={{ display: 'inline-block', whiteSpace: 'nowrap' }}>
                {i > 0 ? '• ' : ''}{bullet}
              </span>
            </span>
          ))}
        </div>
        {descLine && <><hr style={{ border: 'none', borderTop: `2px solid ${dividerColor}`, margin: '0 auto', width: '100%' }} /><div>{descLine}</div></>}
      </>
    );
  };

  if (loading) {
    return (
      <div style={{ 
        fontFamily: "'Sorts Mill Goudy', Georgia, serif",
        maxWidth: '800px',
        margin: '0 auto',
        padding: '40px 20px',
        color: '#333333',
        backgroundColor: '#E2D4B8',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{ fontSize: '1.2rem' }}>Loading...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{ 
        fontFamily: "'Sorts Mill Goudy', Georgia, serif",
        maxWidth: '500px',
        margin: '0 auto',
        padding: '40px 20px',
        color: '#333333',
        backgroundColor: '#E2D4B8',
        minHeight: '100vh'
      }}>
        <h1 style={{
          fontFamily: "'Philosopher', sans-serif",
          color: '#2D6A4F',
          fontSize: '2rem',
          marginBottom: '0.5rem',
          textAlign: 'center'
        }}>
          Capacity Tracker
        </h1>
        <p style={{ textAlign: 'center', marginBottom: '2rem', color: '#8C8C8C' }}>
          Track your energy across Physical, Cognitive, and Emotional/Sensory domains
        </p>

        <div style={{
          backgroundColor: '#F5F5F0',
          padding: '2rem',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
        }}>
          <div style={{ marginBottom: '1.5rem', textAlign: 'center' }}>
            <button
              onClick={() => setAuthMode('login')}
              style={{
                padding: '0.5rem 1.5rem',
                marginRight: '1rem',
                backgroundColor: authMode === 'login' ? '#2D6A4F' : 'transparent',
                color: authMode === 'login' ? '#fff' : '#2D6A4F',
                border: `2px solid #2D6A4F`,
                borderRadius: '4px',
                cursor: 'pointer',
                fontFamily: "'Philosopher', sans-serif",
                fontSize: '1rem'
              }}
            >
              Login
            </button>
            <button
              onClick={() => setAuthMode('signup')}
              style={{
                padding: '0.5rem 1.5rem',
                backgroundColor: authMode === 'signup' ? '#2D6A4F' : 'transparent',
                color: authMode === 'signup' ? '#fff' : '#2D6A4F',
                border: `2px solid #2D6A4F`,
                borderRadius: '4px',
                cursor: 'pointer',
                fontFamily: "'Philosopher', sans-serif",
                fontSize: '1rem'
              }}
            >
              Sign Up
            </button>
          </div>

          <form onSubmit={authMode === 'login' ? handleLogin : handleSignUp}>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #8C8C8C',
                  borderRadius: '4px',
                  fontSize: '1rem',
                  fontFamily: "'Sorts Mill Goudy', Georgia, serif"
                }}
              />
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #8C8C8C',
                  borderRadius: '4px',
                  fontSize: '1rem',
                  fontFamily: "'Sorts Mill Goudy', Georgia, serif"
                }}
              />
            </div>

            {authError && (
              <div style={{
                padding: '0.75rem',
                backgroundColor: '#ffebee',
                color: '#c62828',
                borderRadius: '4px',
                marginBottom: '1rem',
                fontSize: '0.9rem'
              }}>
                {authError}
              </div>
            )}

            <button
              type="submit"
              style={{
                width: '100%',
                padding: '0.75rem',
                backgroundColor: '#2D6A4F',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontFamily: "'Philosopher', sans-serif",
                fontSize: '1.1rem',
                fontWeight: '600'
              }}
            >
              {authMode === 'login' ? 'Login' : 'Sign Up'}
            </button>
          </form>

          {authMode === 'signup' && (
            <p style={{
              marginTop: '1rem',
              fontSize: '0.9rem',
              color: '#8C8C8C',
              textAlign: 'center'
            }}>
              You'll receive a confirmation email after signing up
            </p>
          )}
        </div>
      </div>
    );
  }

  // Main tracker UI (only shown when logged in)
  return (
    <div style={{ 
      fontFamily: "'Sorts Mill Goudy', Georgia, serif",
      maxWidth: '800px',
      margin: '0 auto',
      padding: '20px',
      color: '#333333',
      backgroundColor: '#E2D4B8',
      minHeight: '100vh'
    }}>
      {/* Header with logout */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '1rem'
      }}>
        <h1 style={{
          fontFamily: "'Philosopher', sans-serif",
          color: '#2D6A4F',
          fontSize: '2rem',
          margin: 0
        }}>
          Capacity Tracker
        </h1>
        <button
          onClick={handleLogout}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: '#B5451B',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontFamily: "'Philosopher', sans-serif",
            fontSize: '0.9rem'
          }}
        >
          Logout
        </button>
      </div>

      {/* Zone Reference Guide Toggle */}
      <button
        onClick={() => setShowReference(!showReference)}
        style={{
          width: '100%',
          padding: '12px',
          backgroundColor: '#F5F5F0',
          color: '#2D6A4F',
          border: '2px solid #2D6A4F',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '1rem',
          fontWeight: '600',
          marginBottom: '20px',
          fontFamily: "'Philosopher', sans-serif"
        }}
      >
        {showReference ? 'Hide' : 'View'} Zone Reference Guide
      </button>

      {/* Zone Reference Guide */}
      {showReference && (() => {
        const refData = [
          {
            pot: 'Physical Capacity',
            zones: [
              { name: 'Shutdown (0-5%)', color: '#8B0000', happening: 'Your body has hit its limit. Likely experiencing sleep debt, under-eating, overexertion, or sustained physical demands without recovery.', feelsLike: 'Profound heaviness - body feels weighted down. Simple movements require conscious effort. Pull toward stillness and sleep.', needs: 'Rest and refuel. Sleep, eat, reduce physical demands.' },
              { name: 'Depleted (6-20%)', color: '#DC143C', happening: 'Physical reserves are low. High chance of shutdown.', feelsLike: 'Deep tiredness. Body feels heavier - movements slower, less fluid, clumsy.', needs: 'More rest. Stop pushing through. Prioritize sleep and meals.' },
              { name: 'Tiring (21-40%)', color: '#FF6B35', happening: 'Physical fatigue building. Body signaling need for rest.', feelsLike: 'Wanting rest or break. Slight heaviness. Slowing pace.', needs: 'Start wrapping up. Switch to restorative activities.' },
            ]
          },
          {
            pot: 'Cognitive Capacity',
            zones: [
              { name: 'Shutdown (0-5%)', color: '#8B0000', happening: 'Cognitive capacity hit limit. Simple decisions overwhelming.', feelsLike: 'Mental blankness. High distractibility. Words won\'t come.', needs: 'Cognitive rest. No decisions. Simple tasks only.' },
              { name: 'Depleted (6-20%)', color: '#DC143C', happening: 'Cognitive reserves low. Slower thinking. Mistakes common.', feelsLike: 'Brain slow, foggy. Re-reading sentences. Words harder to find.', needs: 'Reduce complexity. Use checklists. Accept slower processing.' },
              { name: 'Tiring (21-40%)', color: '#FF6B35', happening: 'Mental fatigue building. Concentration waning.', feelsLike: 'Craving distraction. Attention drifting. Text feels overwhelming.', needs: 'Wind down cognitive work. Switch to neutral activities.' },
            ]
          },
          {
            pot: 'Emotional/Sensory Capacity',
            zones: [
              { name: 'Shutdown (0-5%)', color: '#8B0000', happening: 'Nervous system hit limit. Cannot filter sensory/emotional input.', feelsLike: 'Everything \'too loud\' or blank. Want to \'tear off skin\'. Stimuli unbearable.', needs: 'Permission to withdraw. Control of inputs. Gentle support only.' },
              { name: 'Depleted (6-20%)', color: '#DC143C', happening: 'Close to limit. Heightened sensitivity. \'Sticky\' negative triggers.', feelsLike: 'Everything \'too much\' or \'can\'t be bothered\'. Seeking quick dopamine.', needs: 'Reduce load. Quiet, familiar, low-demand spaces. Permission to cancel.' },
              { name: 'Tiring (21-40%)', color: '#FF6B35', happening: 'Capacity emptying. Responses dulled or heightened.', feelsLike: 'Pull towards quiet, calm. Slight sensitivity. Comfort seeking.', needs: 'Be intentional with demands. Prioritise gentle activities.' },
            ]
          },
        ];

        const togglePot = (pot) => {
          setOpenRefPots(prev => {
            const next = new Set(prev);
            next.has(pot) ? next.delete(pot) : next.add(pot);
            return next;
          });
        };

        const toggleZone = (key) => {
          setOpenRefZones(prev => {
            const next = new Set(prev);
            next.has(key) ? next.delete(key) : next.add(key);
            return next;
          });
        };

        return (
          <div style={{ backgroundColor: '#F5F5F0', borderRadius: '8px', marginBottom: '20px', overflow: 'hidden', border: '1px solid #d1d5db' }}>
            {refData.map(({ pot, zones }) => {
              const potOpen = openRefPots.has(pot);
              return (
                <div key={pot} style={{ borderBottom: '1px solid #d1d5db' }}>
                  <button
                    onClick={() => togglePot(pot)}
                    style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', backgroundColor: 'transparent', border: 'none', cursor: 'pointer', fontFamily: "'Philosopher', sans-serif", fontSize: '1rem', fontWeight: '600', color: '#2D6A4F', textAlign: 'left' }}
                  >
                    {pot}
                    <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>{potOpen ? '▲' : '▼'}</span>
                  </button>
                  {potOpen && (
                    <div style={{ padding: '0 12px 12px' }}>
                      {zones.map(({ name, color, happening, feelsLike, needs }) => {
                        const zoneKey = `${pot}-${name}`;
                        const zoneOpen = openRefZones.has(zoneKey);
                        return (
                          <div key={name} style={{ borderRadius: '6px', overflow: 'hidden', marginBottom: '8px' }}>
                            <button
                              onClick={() => toggleZone(zoneKey)}
                              style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', backgroundColor: color, border: 'none', cursor: 'pointer', fontFamily: "'Philosopher', sans-serif", fontSize: '0.95rem', fontWeight: '600', color: '#fff', textAlign: 'left', borderRadius: zoneOpen ? '6px 6px 0 0' : '6px' }}
                            >
                              {name}
                              <span style={{ fontSize: '0.75rem', opacity: 0.85 }}>{zoneOpen ? '▲' : '▼'}</span>
                            </button>
                            {zoneOpen && (
                              <div style={{ backgroundColor: color, padding: '0 14px 12px', borderTop: '1px solid rgba(255,255,255,0.2)' }}>
                                <div style={{ fontSize: '0.9rem', marginBottom: '8px', lineHeight: '1.5', opacity: 0.95, color: '#fff' }}>
                                  <strong>What's happening:</strong> {happening}
                                </div>
                                <div style={{ fontSize: '0.9rem', marginBottom: '8px', lineHeight: '1.5', opacity: 0.95, color: '#fff' }}>
                                  <strong>Feels like:</strong> {feelsLike}
                                </div>
                                <div style={{ fontSize: '0.9rem', lineHeight: '1.5', opacity: 0.95, color: '#fff' }}>
                                  <strong>Immediate needs:</strong> {needs}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* Tracker Interface - same as before */}
      <div style={{ 
        backgroundColor: '#F5F5F0',
        padding: '20px',
        borderRadius: '8px',
        marginBottom: '20px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
      }}>
        {/* Physical Capacity Slider */}
        <div style={{ marginBottom: '30px' }}>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            marginBottom: '10px'
          }}>
            <label style={{ 
              fontFamily: "'Philosopher', sans-serif !important",
              fontSize: '1.2rem',
              fontWeight: '600',
              color: '#2D6A4F'
            }}>
              Physical Capacity
            </label>
            <span style={{ 
              fontSize: '1.5rem',
              fontWeight: '600',
              color: getZoneInfo(physicalPot).color
            }}>
              {physicalPot}%
            </span>
          </div>
          
          <div style={{ 
            padding: '12px 8px',
            backgroundColor: physicalPot <= 5 ? '#fca5a5' : physicalPot <= 20 ? '#fee2e2' : physicalPot <= 40 ? '#fef3c7' : '#f9fafb',
            borderLeft: physicalPot <= 5 ? '4px solid #dc2626' : physicalPot <= 20 ? '4px solid #f87171' : physicalPot <= 40 ? '4px solid #fbbf24' : '4px solid #d1d5db',
            borderRadius: '8px',
            marginBottom: '8px',
            color: '#333',
            fontSize: '0.9rem',
            lineHeight: '1.6',
            minHeight: '60px',
            fontFamily: "'Sorts Mill Goudy', Georgia, serif"
          }}>
            {renderTooltipText('Physical', physicalPot)}
          </div>

          <input
            type="range"
            min="0"
            max="100"
            value={physicalPot}
            onChange={(e) => setPhysicalPot(parseInt(e.target.value))}
            style={{
              width: '100%',
              height: '8px',
              borderRadius: '8px',
              appearance: 'none',
              background: `linear-gradient(to right, 
                rgb(153 27 27) 0%, 
                rgb(239 68 68) 20%, 
                rgb(249 115 22) 40%, 
                rgb(234 179 8) 60%, 
                rgb(16 185 129) 80%, 
                rgb(34 197 94) 100%)`,
              outline: 'none',
              cursor: 'pointer'
            }}
          />
        </div>

        {/* Cognitive Capacity Slider */}
        <div style={{ marginBottom: '30px' }}>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            marginBottom: '10px'
          }}>
            <label style={{ 
              fontFamily: "'Philosopher', sans-serif !important",
              fontSize: '1.2rem',
              fontWeight: '600',
              color: '#2D6A4F'
            }}>
              Cognitive Capacity
            </label>
            <span style={{ 
              fontSize: '1.5rem',
              fontWeight: '600',
              color: getZoneInfo(cognitivePot).color
            }}>
              {cognitivePot}%
            </span>
          </div>
          
          <div style={{ 
            padding: '12px 8px',
            backgroundColor: cognitivePot <= 5 ? '#fca5a5' : cognitivePot <= 20 ? '#fee2e2' : cognitivePot <= 40 ? '#fef3c7' : '#f9fafb',
            borderLeft: cognitivePot <= 5 ? '4px solid #dc2626' : cognitivePot <= 20 ? '4px solid #f87171' : cognitivePot <= 40 ? '4px solid #fbbf24' : '4px solid #d1d5db',
            borderRadius: '8px',
            marginBottom: '8px',
            color: '#333',
            fontSize: '0.9rem',
            lineHeight: '1.6',
            minHeight: '60px',
            fontFamily: "'Sorts Mill Goudy', Georgia, serif"
          }}>
            {renderTooltipText('Cognitive', cognitivePot)}
          </div>

          <input
            type="range"
            min="0"
            max="100"
            value={cognitivePot}
            onChange={(e) => setCognitivePot(parseInt(e.target.value))}
            style={{
              width: '100%',
              height: '8px',
              borderRadius: '8px',
              appearance: 'none',
              background: `linear-gradient(to right, 
                rgb(153 27 27) 0%, 
                rgb(239 68 68) 20%, 
                rgb(249 115 22) 40%, 
                rgb(234 179 8) 60%, 
                rgb(16 185 129) 80%, 
                rgb(34 197 94) 100%)`,
              outline: 'none',
              cursor: 'pointer'
            }}
          />
        </div>

        {/* Emotional/Sensory Capacity Slider */}
        <div style={{ marginBottom: '30px' }}>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            marginBottom: '10px'
          }}>
            <label style={{ 
              fontFamily: "'Philosopher', sans-serif !important",
              fontSize: '1.2rem',
              fontWeight: '600',
              color: '#2D6A4F'
            }}>
              Emotional/Sensory Capacity
            </label>
            <span style={{ 
              fontSize: '1.5rem',
              fontWeight: '600',
              color: getZoneInfo(emotionalPot).color
            }}>
              {emotionalPot}%
            </span>
          </div>
          
          <div style={{ 
            padding: '12px 8px',
            backgroundColor: emotionalPot <= 5 ? '#fca5a5' : emotionalPot <= 20 ? '#fee2e2' : emotionalPot <= 40 ? '#fef3c7' : '#f9fafb',
            borderLeft: emotionalPot <= 5 ? '4px solid #dc2626' : emotionalPot <= 20 ? '4px solid #f87171' : emotionalPot <= 40 ? '4px solid #fbbf24' : '4px solid #d1d5db',
            borderRadius: '8px',
            marginBottom: '8px',
            color: '#333',
            fontSize: '0.9rem',
            lineHeight: '1.6',
            minHeight: '60px',
            fontFamily: "'Sorts Mill Goudy', Georgia, serif"
          }}>
            {renderTooltipText('Emotional/Sensory', emotionalPot)}
          </div>

          <input
            type="range"
            min="0"
            max="100"
            value={emotionalPot}
            onChange={(e) => setEmotionalPot(parseInt(e.target.value))}
            style={{
              width: '100%',
              height: '8px',
              borderRadius: '8px',
              appearance: 'none',
              background: `linear-gradient(to right, 
                rgb(153 27 27) 0%, 
                rgb(239 68 68) 20%, 
                rgb(249 115 22) 40%, 
                rgb(234 179 8) 60%, 
                rgb(16 185 129) 80%, 
                rgb(34 197 94) 100%)`,
              outline: 'none',
              cursor: 'pointer'
            }}
          />
        </div>

        {/* Activity Search */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{
            fontFamily: "'Philosopher', sans-serif",
            fontSize: '1.1rem',
            fontWeight: '600',
            color: '#2D6A4F',
            display: 'block',
            marginBottom: '10px'
          }}>
            Activities since last check in?
          </label>

          {/* Selected chips */}
          {selectedTags.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
              {selectedTags.map(tag => (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: '#2D6A4F',
                    color: '#fff',
                    border: '1px solid #2D6A4F',
                    borderRadius: '16px',
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                    fontFamily: "'Sorts Mill Goudy', Georgia, serif",
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  {tag} <span style={{ opacity: 0.7, fontSize: '0.85rem' }}>✕</span>
                </button>
              ))}
            </div>
          )}

          {/* Search input */}
          <input
            type="text"
            value={activitySearch}
            onChange={(e) => setActivitySearch(e.target.value)}
            placeholder="Search activities..."
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid #8C8C8C',
              borderRadius: '4px',
              fontSize: '0.9rem',
              fontFamily: "'Sorts Mill Goudy', Georgia, serif",
              boxSizing: 'border-box',
              marginBottom: '8px'
            }}
          />

          {/* Search results */}
          {activitySearch.trim() && (() => {
            const term = activitySearch.trim();
            const matches = allActivities.filter(a =>
              a.toLowerCase().includes(term.toLowerCase()) && !selectedTags.includes(a)
            );
            const isNew = !allActivities.some(a => a.toLowerCase() === term.toLowerCase());

            return (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {matches.map(tag => (
                  <button
                    key={tag}
                    onClick={() => { toggleTag(tag); setActivitySearch(''); }}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: '#F5F5F0',
                      color: '#333333',
                      border: '1px solid #8C8C8C',
                      borderRadius: '16px',
                      cursor: 'pointer',
                      fontSize: '0.9rem',
                      fontFamily: "'Sorts Mill Goudy', Georgia, serif"
                    }}
                  >
                    {tag}
                  </button>
                ))}
                {isNew && (
                  <button
                    onClick={() => addCustomActivity(term)}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: '#E2D4B8',
                      color: '#2D6A4F',
                      border: '1px solid #4A9B73',
                      borderRadius: '16px',
                      cursor: 'pointer',
                      fontSize: '0.9rem',
                      fontFamily: "'Sorts Mill Goudy', Georgia, serif",
                      fontStyle: 'italic'
                    }}
                  >
                    + Add activity
                  </button>
                )}
              </div>
            );
          })()}
        </div>

        {/* Save Button */}
        <button
          onClick={saveCheckIn}
          style={{
            width: '100%',
            padding: '15px',
            backgroundColor: '#2D6A4F',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '1.1rem',
            fontWeight: '600',
            fontFamily: "'Philosopher', sans-serif"
          }}
        >
          Save Check-in
        </button>
      </div>

      {/* History Toggle */}
      <button
        onClick={() => setShowHistory(!showHistory)}
        style={{
          width: '100%',
          padding: '12px',
          backgroundColor: '#F5F5F0',
          color: '#2D6A4F',
          border: '2px solid #2D6A4F',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '1rem',
          fontWeight: '600',
          marginBottom: '10px',
          fontFamily: "'Philosopher', sans-serif"
        }}
      >
        {showHistory ? 'Hide' : 'View'} History
      </button>

      {/* History Display */}
      {showHistory && history.length > 0 && (
        <div style={{
          backgroundColor: '#F5F5F0',
          padding: '20px',
          borderRadius: '8px',
          marginBottom: '20px',
          maxHeight: '400px',
          overflowY: 'auto'
        }}>
          <h3 style={{
            fontFamily: "'Philosopher', sans-serif",
            color: '#2D6A4F',
            marginTop: 0,
            marginBottom: '15px'
          }}>
            Recent Check-ins
          </h3>
          {history.map((entry, idx) => (
            <div key={idx} style={{
              padding: '12px',
              backgroundColor: '#fff',
              borderRadius: '4px',
              marginBottom: '10px',
              borderLeft: `4px solid ${getZoneInfo(Math.min(entry.physical_level, entry.cognitive_level, entry.emotional_level)).color}`
            }}>
              <div style={{ 
                fontSize: '0.85rem',
                color: '#8C8C8C',
                marginBottom: '8px'
              }}>
                {new Date(entry.created_at).toLocaleString()}
              </div>
              <div style={{ display: 'flex', gap: '15px', marginBottom: '8px' }}>
                <span>💪 {entry.physical_level}%</span>
                <span>🧠 {entry.cognitive_level}%</span>
                <span>❤️ {entry.emotional_level}%</span>
              </div>
              {entry.activities && entry.activities.length > 0 && (
                <div style={{ fontSize: '0.9rem', color: '#666' }}>
                  {entry.activities.join(', ')}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Warning Modal */}
      {showWarningModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: '#F5F5F0',
            padding: '30px',
            borderRadius: '8px',
            maxWidth: '500px',
            maxHeight: '80vh',
            overflowY: 'auto'
          }}>
            <h2 style={{
              fontFamily: "'Philosopher', sans-serif",
              color: '#B5451B',
              marginTop: 0,
              marginBottom: '20px'
            }}>
              ⚠️ Capacity Warnings
            </h2>
            
            {warningMessages.map((warning, idx) => (
              <div key={idx} style={{
                padding: '20px',
                backgroundColor: warning.severity === 'crisis' ? '#ffebee' : 
                                warning.severity === 'crisis-imminent' ? '#fff3e0' : '#fffde7',
                borderLeft: `4px solid ${warning.severity === 'crisis' ? '#c62828' : 
                                        warning.severity === 'crisis-imminent' ? '#e65100' : '#f9a825'}`,
                borderRadius: '4px',
                marginBottom: '20px'
              }}>
                <div style={{ 
                  fontSize: '1.3rem',
                  marginBottom: '15px',
                  fontFamily: "'Philosopher', sans-serif",
                  fontWeight: '600',
                  color: '#333'
                }}>
                  {warning.emoji} {warning.title}
                </div>
                
                <div style={{ marginBottom: '15px' }}>
                  <div style={{ 
                    fontWeight: '600', 
                    marginBottom: '6px', 
                    color: '#2D6A4F',
                    fontSize: '1rem'
                  }}>
                    What's happening:
                  </div>
                  <div style={{ fontSize: '0.95rem', color: '#666', lineHeight: '1.6' }}>
                    {warning.whatHappening}
                  </div>
                </div>

                <div style={{ marginBottom: '15px' }}>
                  <div style={{ 
                    fontWeight: '600', 
                    marginBottom: '6px', 
                    color: '#2D6A4F',
                    fontSize: '1rem'
                  }}>
                    What's needed:
                  </div>
                  <div style={{ fontSize: '0.95rem', color: '#666', lineHeight: '1.6' }}>
                    {warning.whatNeeded}
                  </div>
                </div>

                {warning.warningHeader && warning.warningBody && (
                  <div style={{ 
                    padding: '12px',
                    backgroundColor: warning.severity === 'crisis' ? 'rgba(198,40,40,0.1)' : 
                                    warning.severity === 'crisis-imminent' ? 'rgba(230,81,0,0.1)' : 'rgba(249,168,37,0.1)',
                    borderRadius: '4px',
                    marginBottom: '12px'
                  }}>
                    <div style={{ 
                      fontWeight: '600', 
                      marginBottom: '4px', 
                      color: warning.severity === 'crisis' ? '#c62828' : 
                             warning.severity === 'crisis-imminent' ? '#e65100' : '#f9a825',
                      fontSize: '0.95rem'
                    }}>
                      {warning.warningHeader}
                    </div>
                    <div style={{ fontSize: '0.9rem', color: '#333', lineHeight: '1.5' }}>
                      {warning.warningBody}
                    </div>
                  </div>
                )}

                {warning.caution && (
                  <div style={{ 
                    padding: '10px',
                    backgroundColor: 'rgba(249,168,37,0.15)',
                    borderRadius: '4px',
                    fontSize: '0.9rem',
                    color: '#666',
                    fontStyle: 'italic',
                    marginBottom: '12px'
                  }}>
                    ⚠️ {warning.caution}
                  </div>
                )}

                {warning.context && (
                  <div style={{ 
                    fontSize: '0.85rem',
                    color: '#8C8C8C',
                    lineHeight: '1.5',
                    marginTop: '10px',
                    paddingTop: '10px',
                    borderTop: '1px solid rgba(140,140,140,0.2)'
                  }}>
                    {warning.context}
                  </div>
                )}
              </div>
            ))}

            <button
              onClick={() => setShowWarningModal(false)}
              style={{
                width: '100%',
                padding: '12px',
                backgroundColor: '#2D6A4F',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '1rem',
                fontWeight: '600',
                fontFamily: "'Philosopher', sans-serif"
              }}
            >
              I Understand
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ThreePotTracker;