import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  ResponsiveContainer, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend
} from 'recharts';

// Initialize Supabase client
const supabaseUrl = 'https://tjxreolqbbqmbjkefmpe.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqeHJlb2xxYmJxbWJqa2VmbXBlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxNjYyNDgsImV4cCI6MjA5MTc0MjI0OH0.aBVrTywm4D4XX6vYahcL3eFYTnLLVJu6OG4LAIZ4U-U';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const DEFAULT_FOOD_ITEMS = [
  'Water', 'Coffee', 'Tea', 'Juice', 'Smoothie', 'Energy drink', 'Alcohol',
  'Toast', 'Cereal', 'Porridge', 'Yoghurt', 'Eggs', 'Fruit',
  'Sandwich', 'Salad', 'Soup', 'Wrap', 'Sushi',
  'Pasta', 'Rice', 'Curry', 'Stir fry', 'Pizza', 'Burger', 'Chips',
  'Nuts', 'Crisps', 'Chocolate', 'Biscuits', 'Cake', 'Protein bar',
  'Takeaway', 'Ready meal', 'Leftovers'
];

const MEAL_BUCKETS = ['Breakfast', 'Lunch', 'Dinner', 'Snack', 'Drink'];

const TIME_OPTIONS = (() => {
  const times = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 15) {
      times.push(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`);
    }
  }
  return times;
})();

const todayDate = () => new Date().toISOString().split('T')[0];
const yesterdayDate = () => new Date(Date.now() - 86400000).toISOString().split('T')[0];

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
  const [authMode, setAuthMode] = useState('login'); // 'login'|'signup'|'forgot'|'check-email'|'reset-password'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetBanner, setResetBanner] = useState(false);
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
  const [historyView, setHistoryView] = useState('chart'); // 'chart' | 'log'
  const [chartDays, setChartDays] = useState(7);
  const [showActivityOverlay, setShowActivityOverlay] = useState(true);
  const [showReference, setShowReference] = useState(false);
  const [openRefPots, setOpenRefPots] = useState(new Set());
  const [openRefZones, setOpenRefZones] = useState(new Set());
  const [warningMessages, setWarningMessages] = useState([]);
  const [showWarningModal, setShowWarningModal] = useState(false);

  // Sleep tracking
  const [showSleepModal, setShowSleepModal] = useState(false);
  const [sleepDate, setSleepDate] = useState(yesterdayDate());
  const [sleepStart, setSleepStart] = useState('22:00');
  const [sleepEnd, setSleepEnd] = useState('07:00');
  const [sleepQuality, setSleepQuality] = useState(0);
  const [hasLoggedSleepToday, setHasLoggedSleepToday] = useState(false);

  // Food tracking
  const [showFoodModal, setShowFoodModal] = useState(false);
  const [foodDate, setFoodDate] = useState(todayDate());
  const [foodSearch, setFoodSearch] = useState('');
  const [allFoodItems, setAllFoodItems] = useState(DEFAULT_FOOD_ITEMS);
  const [foodEntries, setFoodEntries] = useState([]);

  // Post check-in tracking prompt
  const [showTrackingPrompt, setShowTrackingPrompt] = useState(false);

  const [activitySearch, setActivitySearch] = useState('');
  const [allActivities, setAllActivities] = useState(PRESET_ACTIVITIES);

  // Check for existing session on mount
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (_event === 'PASSWORD_RECOVERY') {
        // User clicked the reset link — show new password form, don't enter app yet
        setAuthMode('reset-password');
        setUser(null);
      } else {
        setUser(session?.user ?? null);
      }
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

      // Load global food items
      const { data: customFoodItems } = await supabase
        .from('food_items')
        .select('name')
        .order('name');

      if (customFoodItems?.length) {
        const customFoodNames = customFoodItems.map(f => f.name);
        setAllFoodItems([
          ...DEFAULT_FOOD_ITEMS,
          ...customFoodNames.filter(n => !DEFAULT_FOOD_ITEMS.includes(n))
        ]);
      }

      // Check if sleep already logged today
      const { data: sleepToday } = await supabase
        .from('sleep_logs')
        .select('id')
        .eq('user_id', user.id)
        .eq('sleep_date', todayDate())
        .limit(1);

      setHasLoggedSleepToday(!!(sleepToday?.length));

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

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setResetError('');
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: `${window.location.origin}`
      });
      if (error) throw error;
    } catch (err) {
      // Don't reveal if email exists — always show the check-email screen
      console.error(err);
    }
    // Always show confirmation regardless (security: don't reveal if email exists)
    setAuthMode('check-email');
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setResetError('');
    if (newPassword !== confirmPassword) {
      setResetError('Passwords don\'t match — give it another go.');
      return;
    }
    if (newPassword.length < 6) {
      setResetError('Password needs to be at least 6 characters.');
      return;
    }
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      // Auto-login is already active (PASSWORD_RECOVERY session) — just enter the app
      setResetBanner(true);
      setNewPassword('');
      setConfirmPassword('');
      // Trigger the normal auth flow so user lands in the app
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
    } catch (err) {
      if (err.message?.includes('expired') || err.message?.includes('invalid')) {
        setResetError('This reset link has expired. Request a new one below.');
      } else {
        setResetError(err.message || 'Something went wrong — please try again.');
      }
    }
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

      // Prompt to track food/sleep if not yet done today
      setShowTrackingPrompt(true);

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

  // --- Sleep helpers ---
  const calcSleepDuration = (start, end) => {
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    let startMins = sh * 60 + sm;
    let endMins = eh * 60 + em;
    if (endMins <= startMins) endMins += 24 * 60; // crosses midnight
    return (endMins - startMins) / 60;
  };

  const saveSleep = async () => {
    if (!sleepQuality) { alert('Please add a quality rating before saving.'); return; }
    const duration = calcSleepDuration(sleepStart, sleepEnd);
    const { error } = await supabase.from('sleep_logs').insert([{
      user_id: user.id,
      sleep_date: sleepDate,
      sleep_start: sleepStart,
      sleep_end: sleepEnd,
      duration_hours: duration,
      quality: sleepQuality
    }]);
    if (error) { console.error(error); alert('Error saving sleep log.'); return; }
    setHasLoggedSleepToday(sleepDate === todayDate());
    setShowSleepModal(false);
    setSleepQuality(0);
    setSleepDate(yesterdayDate());
    setSleepStart('22:00');
    setSleepEnd('07:00');
  };

  // --- Food helpers ---
  const addFoodEntry = (name) => {
    setFoodEntries(prev => [...prev, { name, time: '', bucket: '' }]);
    setFoodSearch('');
  };

  const updateFoodEntry = (idx, field, value) => {
    setFoodEntries(prev => prev.map((e, i) => i === idx ? { ...e, [field]: value } : e));
  };

  const removeFoodEntry = (idx) => {
    setFoodEntries(prev => prev.filter((_, i) => i !== idx));
  };

  const addCustomFoodItem = async (name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    await supabase.from('food_items').upsert({ name: trimmed, created_by: user.id }, { onConflict: 'name' });
    setAllFoodItems(prev => prev.includes(trimmed) ? prev : [...prev, trimmed]);
    addFoodEntry(trimmed);
  };

  const saveFood = async () => {
    if (!foodEntries.length) { alert('Add at least one item before saving.'); return; }
    const rows = foodEntries.map(e => ({
      user_id: user.id,
      log_date: foodDate,
      log_time: e.time || null,
      item_name: e.name,
      meal_bucket: e.bucket || null
    }));
    const { error } = await supabase.from('food_logs').insert(rows);
    if (error) { console.error(error); alert('Error saving food log.'); return; }
    setShowFoodModal(false);
    setFoodEntries([]);
    setFoodSearch('');
    setFoodDate(todayDate());
  };

  const getChartData = (days) => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return [...history]
      .filter(e => new Date(e.created_at) >= cutoff)
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      .map(e => {
        const d = new Date(e.created_at);
        return {
          timestamp: d.getTime(),
          label: d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
                 + '\n' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
          dateOnly: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
          Physical: e.physical_level,
          Cognitive: e.cognitive_level,
          'Emotional/Sensory': e.emotional_level,
          activities: (e.activities || []),
          hasActivities: (e.activities || []).length > 0,
        };
      });
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

        <div style={{ backgroundColor: '#F5F5F0', padding: '2rem', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>

          {/* ── Login / Sign Up ── */}
          {(authMode === 'login' || authMode === 'signup') && (<>
            <div style={{ marginBottom: '1.5rem', textAlign: 'center' }}>
              {['login','signup'].map(mode => (
                <button key={mode} onClick={() => { setAuthMode(mode); setAuthError(''); }}
                  style={{ padding: '0.5rem 1.5rem', marginRight: mode === 'login' ? '1rem' : 0,
                    backgroundColor: authMode === mode ? '#2D6A4F' : 'transparent',
                    color: authMode === mode ? '#fff' : '#2D6A4F',
                    border: '2px solid #2D6A4F', borderRadius: '4px', cursor: 'pointer',
                    fontFamily: "'Philosopher', sans-serif", fontSize: '1rem' }}>
                  {mode === 'login' ? 'Login' : 'Sign Up'}
                </button>
              ))}
            </div>

            <form onSubmit={authMode === 'login' ? handleLogin : handleSignUp}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                  style={{ width: '100%', padding: '0.75rem', border: '1px solid #8C8C8C', borderRadius: '4px', fontSize: '1rem', fontFamily: "'Sorts Mill Goudy', Georgia, serif", boxSizing: 'border-box' }} />
              </div>
              <div style={{ marginBottom: authMode === 'login' ? '0.5rem' : '1.5rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>Password</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6}
                  style={{ width: '100%', padding: '0.75rem', border: '1px solid #8C8C8C', borderRadius: '4px', fontSize: '1rem', fontFamily: "'Sorts Mill Goudy', Georgia, serif", boxSizing: 'border-box' }} />
              </div>

              {authMode === 'login' && (
                <div style={{ textAlign: 'right', marginBottom: '1.5rem' }}>
                  <button type="button" onClick={() => { setAuthMode('forgot'); setResetEmail(email); setResetError(''); }}
                    style={{ background: 'none', border: 'none', color: '#4A9B73', cursor: 'pointer', fontSize: '0.9rem', fontFamily: "'Sorts Mill Goudy', Georgia, serif", textDecoration: 'underline' }}>
                    Forgot password?
                  </button>
                </div>
              )}

              {authError && (
                <div style={{ padding: '0.75rem', backgroundColor: '#ffebee', color: '#c62828', borderRadius: '4px', marginBottom: '1rem', fontSize: '0.9rem' }}>
                  {authError}
                </div>
              )}

              <button type="submit"
                style={{ width: '100%', padding: '0.75rem', backgroundColor: '#2D6A4F', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontFamily: "'Philosopher', sans-serif", fontSize: '1.1rem', fontWeight: '600' }}>
                {authMode === 'login' ? 'Login' : 'Sign Up'}
              </button>
            </form>

            {authMode === 'signup' && (
              <p style={{ marginTop: '1rem', fontSize: '0.9rem', color: '#8C8C8C', textAlign: 'center' }}>
                You'll receive a confirmation email after signing up
              </p>
            )}
          </>)}

          {/* ── Forgot Password ── */}
          {authMode === 'forgot' && (
            <form onSubmit={handleForgotPassword}>
              <h2 style={{ fontFamily: "'Philosopher', sans-serif", color: '#2D6A4F', marginTop: 0, marginBottom: '0.5rem' }}>
                Forgot your password?
              </h2>
              <p style={{ color: '#666', fontSize: '0.95rem', marginBottom: '1.5rem', lineHeight: '1.6' }}>
                Don't worry — we're an ADHD service, nobody just logs in straightforwardly here! Enter your email and we'll send you a reset link.
              </p>
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>Email address</label>
                <input type="email" value={resetEmail} onChange={e => setResetEmail(e.target.value)} required autoFocus
                  style={{ width: '100%', padding: '0.75rem', border: '1px solid #8C8C8C', borderRadius: '4px', fontSize: '1rem', fontFamily: "'Sorts Mill Goudy', Georgia, serif", boxSizing: 'border-box' }} />
              </div>
              {resetError && (
                <div style={{ padding: '0.75rem', backgroundColor: '#ffebee', color: '#c62828', borderRadius: '4px', marginBottom: '1rem', fontSize: '0.9rem' }}>{resetError}</div>
              )}
              <button type="submit"
                style={{ width: '100%', padding: '0.75rem', backgroundColor: '#2D6A4F', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontFamily: "'Philosopher', sans-serif", fontSize: '1.1rem', fontWeight: '600', marginBottom: '1rem' }}>
                Send reset link
              </button>
              <div style={{ textAlign: 'center' }}>
                <button type="button" onClick={() => setAuthMode('login')}
                  style={{ background: 'none', border: 'none', color: '#4A9B73', cursor: 'pointer', fontSize: '0.9rem', fontFamily: "'Sorts Mill Goudy', Georgia, serif", textDecoration: 'underline' }}>
                  Back to login
                </button>
              </div>
            </form>
          )}

          {/* ── Check Email confirmation ── */}
          {authMode === 'check-email' && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📬</div>
              <h2 style={{ fontFamily: "'Philosopher', sans-serif", color: '#2D6A4F', marginTop: 0, marginBottom: '0.75rem' }}>
                Check your inbox
              </h2>
              <p style={{ color: '#666', fontSize: '0.95rem', lineHeight: '1.6', marginBottom: '1.5rem' }}>
                If that email is registered, a reset link is on its way. The link expires in 1 hour.
              </p>
              <p style={{ color: '#8C8C8C', fontSize: '0.85rem', lineHeight: '1.6', marginBottom: '1.5rem' }}>
                No email? Check your spam folder, or make sure you used the address you signed up with.
              </p>
              <button onClick={() => setAuthMode('forgot')}
                style={{ background: 'none', border: 'none', color: '#4A9B73', cursor: 'pointer', fontSize: '0.9rem', fontFamily: "'Sorts Mill Goudy', Georgia, serif", textDecoration: 'underline' }}>
                Try a different email
              </button>
            </div>
          )}

          {/* ── Reset Password (after clicking email link) ── */}
          {authMode === 'reset-password' && (
            <form onSubmit={handleResetPassword}>
              <h2 style={{ fontFamily: "'Philosopher', sans-serif", color: '#2D6A4F', marginTop: 0, marginBottom: '0.5rem' }}>
                Set new password
              </h2>
              <p style={{ color: '#666', fontSize: '0.95rem', marginBottom: '1.5rem', lineHeight: '1.6' }}>
                Let's get you back in. Choose a new password below.
              </p>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>New password</label>
                <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength={6} autoFocus
                  style={{ width: '100%', padding: '0.75rem', border: '1px solid #8C8C8C', borderRadius: '4px', fontSize: '1rem', fontFamily: "'Sorts Mill Goudy', Georgia, serif", boxSizing: 'border-box' }} />
              </div>
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>Confirm password</label>
                <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required minLength={6}
                  style={{ width: '100%', padding: '0.75rem', border: '1px solid #8C8C8C', borderRadius: '4px', fontSize: '1rem', fontFamily: "'Sorts Mill Goudy', Georgia, serif", boxSizing: 'border-box' }} />
              </div>
              {resetError && (
                <div style={{ padding: '0.75rem', backgroundColor: '#ffebee', color: '#c62828', borderRadius: '4px', marginBottom: '1rem', fontSize: '0.9rem', lineHeight: '1.5' }}>
                  {resetError}
                  {resetError.includes('expired') && (
                    <div style={{ marginTop: '8px' }}>
                      <button type="button" onClick={() => setAuthMode('forgot')}
                        style={{ background: 'none', border: 'none', color: '#c62828', cursor: 'pointer', fontSize: '0.9rem', textDecoration: 'underline', padding: 0 }}>
                        Request a new link
                      </button>
                    </div>
                  )}
                </div>
              )}
              <button type="submit"
                style={{ width: '100%', padding: '0.75rem', backgroundColor: '#2D6A4F', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontFamily: "'Philosopher', sans-serif", fontSize: '1.1rem', fontWeight: '600' }}>
                Reset password
              </button>
            </form>
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
      {/* Password reset success banner */}
      {resetBanner && (
        <div style={{ backgroundColor: '#d1fae5', border: '1px solid #4A9B73', borderRadius: '6px', padding: '12px 16px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#2D6A4F', fontFamily: "'Philosopher', sans-serif", fontWeight: '600' }}>
            ✓ Password updated — you're back in!
          </span>
          <button onClick={() => setResetBanner(false)}
            style={{ background: 'none', border: 'none', color: '#4A9B73', cursor: 'pointer', fontSize: '1.1rem', padding: '0 4px' }}>✕</button>
        </div>
      )}

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

        {/* Food & Sleep quick-log buttons */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
          <button
            onClick={() => { setShowSleepModal(true); setSleepDate(yesterdayDate()); }}
            style={{
              flex: 1, padding: '10px', backgroundColor: '#F5F5F0',
              color: '#2D6A4F', border: '2px solid #2D6A4F', borderRadius: '4px',
              cursor: 'pointer', fontSize: '0.95rem', fontFamily: "'Philosopher', sans-serif",
              fontWeight: '600'
            }}
          >
            🌙 Log Sleep
          </button>
          <button
            onClick={() => { setShowFoodModal(true); setFoodDate(todayDate()); }}
            style={{
              flex: 1, padding: '10px', backgroundColor: '#F5F5F0',
              color: '#2D6A4F', border: '2px solid #2D6A4F', borderRadius: '4px',
              cursor: 'pointer', fontSize: '0.95rem', fontFamily: "'Philosopher', sans-serif",
              fontWeight: '600'
            }}
          >
            🍽️ Log Food & Drink
          </button>
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
          width: '100%', padding: '12px', backgroundColor: '#F5F5F0',
          color: '#2D6A4F', border: '2px solid #2D6A4F', borderRadius: '4px',
          cursor: 'pointer', fontSize: '1rem', fontWeight: '600',
          marginBottom: '10px', fontFamily: "'Philosopher', sans-serif"
        }}
      >
        {showHistory ? 'Hide' : 'View'} History
      </button>

      {/* History Panel */}
      {showHistory && (
        <div style={{ backgroundColor: '#F5F5F0', borderRadius: '8px', marginBottom: '20px', overflow: 'hidden' }}>

          {/* Tab bar */}
          <div style={{ display: 'flex', borderBottom: '2px solid #e5e7eb' }}>
            {['chart', 'log'].map(view => (
              <button key={view} onClick={() => setHistoryView(view)}
                style={{
                  flex: 1, padding: '12px', border: 'none', cursor: 'pointer',
                  fontFamily: "'Philosopher', sans-serif", fontWeight: '600', fontSize: '0.95rem',
                  backgroundColor: historyView === view ? '#fff' : 'transparent',
                  color: historyView === view ? '#2D6A4F' : '#8C8C8C',
                  borderBottom: historyView === view ? '2px solid #2D6A4F' : 'none',
                  marginBottom: historyView === view ? '-2px' : '0'
                }}>
                {view === 'chart' ? '📊 Chart' : '📋 Log'}
              </button>
            ))}
          </div>

          {/* Chart view */}
          {historyView === 'chart' && (() => {
            const chartData = getChartData(chartDays);
            const btnStyle = (active) => ({
              padding: '5px 14px', border: `1px solid ${active ? '#2D6A4F' : '#d1d5db'}`,
              borderRadius: '20px', cursor: 'pointer', fontSize: '0.85rem',
              backgroundColor: active ? '#2D6A4F' : 'transparent',
              color: active ? '#fff' : '#666', fontFamily: "'Philosopher', sans-serif"
            });
            const CustomDot = (key) => (props) => {
              const { cx, cy, payload } = props;
              if (!showActivityOverlay || !payload.hasActivities) return <circle key={key} cx={cx} cy={cy} r={3} fill={props.stroke} />;
              return <circle key={key} cx={cx} cy={cy} r={6} fill={props.stroke} stroke="#fff" strokeWidth={2} />;
            };
            const CustomTooltip = ({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const entry = payload[0]?.payload;
              return (
                <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '10px 14px', fontSize: '0.85rem', fontFamily: "'Sorts Mill Goudy', Georgia, serif", maxWidth: '200px' }}>
                  <div style={{ color: '#8C8C8C', marginBottom: '6px', whiteSpace: 'pre-line' }}>{entry?.label}</div>
                  {payload.map(p => (
                    <div key={p.dataKey} style={{ color: p.color, marginBottom: '2px' }}>
                      {p.dataKey}: <strong>{p.value}%</strong>
                    </div>
                  ))}
                  {entry?.hasActivities && (
                    <div style={{ marginTop: '6px', color: '#555', borderTop: '1px solid #e5e7eb', paddingTop: '6px' }}>
                      {entry.activities.join(', ')}
                    </div>
                  )}
                </div>
              );
            };
            return (
              <div style={{ padding: '16px' }}>
                {/* Controls row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button style={btnStyle(chartDays === 7)} onClick={() => setChartDays(7)}>7 days</button>
                    <button style={btnStyle(chartDays === 30)} onClick={() => setChartDays(30)}>30 days</button>
                  </div>
                  <button onClick={() => setShowActivityOverlay(p => !p)} style={btnStyle(showActivityOverlay)}>
                    ◉ Activities
                  </button>
                </div>

                {chartData.length < 2 ? (
                  <div style={{ textAlign: 'center', color: '#8C8C8C', padding: '40px 20px', fontFamily: "'Sorts Mill Goudy', Georgia, serif" }}>
                    Not enough check-ins yet — check back after a few more entries.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="dateOnly" tick={{ fontSize: 11, fill: '#8C8C8C' }} interval="preserveStartEnd" />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#8C8C8C' }} tickFormatter={v => `${v}%`} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend wrapperStyle={{ fontSize: '0.85rem', fontFamily: "'Philosopher', sans-serif", paddingTop: '8px' }} />
                      <Line type="monotone" dataKey="Physical" stroke="#ef4444" strokeWidth={2} dot={CustomDot('p')} activeDot={{ r: 5 }} />
                      <Line type="monotone" dataKey="Cognitive" stroke="#3b82f6" strokeWidth={2} dot={CustomDot('c')} activeDot={{ r: 5 }} />
                      <Line type="monotone" dataKey="Emotional/Sensory" stroke="#8b5cf6" strokeWidth={2} dot={CustomDot('e')} activeDot={{ r: 5 }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}

                {showActivityOverlay && chartData.some(d => d.hasActivities) && (
                  <div style={{ marginTop: '8px', fontSize: '0.8rem', color: '#8C8C8C', fontFamily: "'Sorts Mill Goudy', Georgia, serif" }}>
                    ◉ Larger dots = check-in had activities logged
                  </div>
                )}
              </div>
            );
          })()}

          {/* Log view */}
          {historyView === 'log' && (
            <div style={{ padding: '16px', maxHeight: '400px', overflowY: 'auto' }}>
              {history.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#8C8C8C', padding: '30px', fontFamily: "'Sorts Mill Goudy', Georgia, serif" }}>No check-ins yet.</div>
              ) : history.map((entry, idx) => (
                <div key={idx} style={{
                  padding: '12px', backgroundColor: '#fff', borderRadius: '4px', marginBottom: '10px',
                  borderLeft: `4px solid ${getZoneInfo(Math.min(entry.physical_level, entry.cognitive_level, entry.emotional_level)).color}`
                }}>
                  <div style={{ fontSize: '0.85rem', color: '#8C8C8C', marginBottom: '6px' }}>
                    {new Date(entry.created_at).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </div>
                  <div style={{ display: 'flex', gap: '12px', marginBottom: entry.activities?.length ? '6px' : 0, fontSize: '0.9rem' }}>
                    <span style={{ color: '#ef4444' }}>💪 {entry.physical_level}%</span>
                    <span style={{ color: '#3b82f6' }}>🧠 {entry.cognitive_level}%</span>
                    <span style={{ color: '#8b5cf6' }}>❤️ {entry.emotional_level}%</span>
                  </div>
                  {entry.activities?.length > 0 && (
                    <div style={{ fontSize: '0.85rem', color: '#666' }}>{entry.activities.join(', ')}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Post check-in tracking prompt */}
      {showTrackingPrompt && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: '20px' }}>
          <div style={{ backgroundColor: '#F5F5F0', borderRadius: '8px', padding: '28px', maxWidth: '380px', width: '100%' }}>
            <h3 style={{ fontFamily: "'Philosopher', sans-serif", color: '#2D6A4F', marginTop: 0, marginBottom: '8px' }}>
              Log anything else?
            </h3>
            <p style={{ color: '#666', fontSize: '0.9rem', marginBottom: '20px', lineHeight: '1.5' }}>
              Track food, drink or sleep alongside this check-in to help spot patterns over time.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button onClick={() => { setShowTrackingPrompt(false); setShowFoodModal(true); }}
                style={{ padding: '12px', backgroundColor: '#F5F5F0', color: '#2D6A4F', border: '2px solid #2D6A4F', borderRadius: '4px', cursor: 'pointer', fontFamily: "'Philosopher', sans-serif", fontWeight: '600', fontSize: '1rem' }}>
                🍽️ Log Food & Drink
              </button>
              {!hasLoggedSleepToday && (
                <button onClick={() => { setShowTrackingPrompt(false); setShowSleepModal(true); }}
                  style={{ padding: '12px', backgroundColor: '#F5F5F0', color: '#2D6A4F', border: '2px solid #2D6A4F', borderRadius: '4px', cursor: 'pointer', fontFamily: "'Philosopher', sans-serif", fontWeight: '600', fontSize: '1rem' }}>
                  🌙 Log Sleep
                </button>
              )}
              <button onClick={() => setShowTrackingPrompt(false)}
                style={{ padding: '12px', backgroundColor: 'transparent', color: '#8C8C8C', border: '1px solid #d1d5db', borderRadius: '4px', cursor: 'pointer', fontFamily: "'Philosopher', sans-serif", fontSize: '0.95rem' }}>
                No thanks
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sleep Modal */}
      {showSleepModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: '20px' }}>
          <div style={{ backgroundColor: '#F5F5F0', borderRadius: '8px', padding: '28px', maxWidth: '420px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ fontFamily: "'Philosopher', sans-serif", color: '#2D6A4F', marginTop: 0, marginBottom: '20px' }}>
              🌙 Log Sleep
            </h3>

            {/* Date */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontFamily: "'Philosopher', sans-serif", fontWeight: '600', color: '#333', marginBottom: '6px', fontSize: '0.95rem' }}>Night of</label>
              <input type="date" value={sleepDate} onChange={e => setSleepDate(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #8C8C8C', borderRadius: '4px', fontSize: '0.9rem', boxSizing: 'border-box' }} />
            </div>

            {/* Start / End times */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontFamily: "'Philosopher', sans-serif", fontWeight: '600', color: '#333', marginBottom: '6px', fontSize: '0.95rem' }}>Fell asleep</label>
                <select value={sleepStart} onChange={e => setSleepStart(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #8C8C8C', borderRadius: '4px', fontSize: '0.9rem' }}>
                  {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontFamily: "'Philosopher', sans-serif", fontWeight: '600', color: '#333', marginBottom: '6px', fontSize: '0.95rem' }}>Woke up</label>
                <select value={sleepEnd} onChange={e => setSleepEnd(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #8C8C8C', borderRadius: '4px', fontSize: '0.9rem' }}>
                  {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>

            {/* Duration display */}
            <div style={{ textAlign: 'center', marginBottom: '16px', color: '#2D6A4F', fontFamily: "'Philosopher', sans-serif", fontSize: '1rem', fontWeight: '600' }}>
              {calcSleepDuration(sleepStart, sleepEnd).toFixed(1)} hours
            </div>

            {/* Quality */}
            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontFamily: "'Philosopher', sans-serif", fontWeight: '600', color: '#333', marginBottom: '10px', fontSize: '0.95rem' }}>Sleep quality</label>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                {[1,2,3,4,5].map(n => (
                  <button key={n} onClick={() => setSleepQuality(n)}
                    style={{ width: '44px', height: '44px', borderRadius: '50%', border: `2px solid ${sleepQuality >= n ? '#2D6A4F' : '#d1d5db'}`, backgroundColor: sleepQuality >= n ? '#2D6A4F' : '#fff', color: sleepQuality >= n ? '#fff' : '#8C8C8C', cursor: 'pointer', fontSize: '1rem', fontWeight: '600' }}>
                    {n}
                  </button>
                ))}
              </div>
              <div style={{ textAlign: 'center', marginTop: '8px', fontSize: '0.85rem', color: '#8C8C8C' }}>
                {['','Poor','Below average','Average','Good','Excellent'][sleepQuality] || 'Tap to rate'}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setShowSleepModal(false)}
                style={{ flex: 1, padding: '12px', backgroundColor: 'transparent', color: '#8C8C8C', border: '1px solid #d1d5db', borderRadius: '4px', cursor: 'pointer', fontFamily: "'Philosopher', sans-serif" }}>
                Cancel
              </button>
              <button onClick={saveSleep}
                style={{ flex: 2, padding: '12px', backgroundColor: '#2D6A4F', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontFamily: "'Philosopher', sans-serif", fontWeight: '600', fontSize: '1rem' }}>
                Save Sleep
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Food & Drink Modal */}
      {showFoodModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: '20px' }}>
          <div style={{ backgroundColor: '#F5F5F0', borderRadius: '8px', padding: '28px', maxWidth: '480px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ fontFamily: "'Philosopher', sans-serif", color: '#2D6A4F', marginTop: 0, marginBottom: '20px' }}>
              🍽️ Log Food & Drink
            </h3>

            {/* Date */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontFamily: "'Philosopher', sans-serif", fontWeight: '600', color: '#333', marginBottom: '6px', fontSize: '0.95rem' }}>Date</label>
              <input type="date" value={foodDate} onChange={e => setFoodDate(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #8C8C8C', borderRadius: '4px', fontSize: '0.9rem', boxSizing: 'border-box' }} />
            </div>

            {/* Search */}
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontFamily: "'Philosopher', sans-serif", fontWeight: '600', color: '#333', marginBottom: '6px', fontSize: '0.95rem' }}>Search & add items</label>
              <input type="text" value={foodSearch} onChange={e => setFoodSearch(e.target.value)}
                placeholder="Search food or drink..."
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #8C8C8C', borderRadius: '4px', fontSize: '0.9rem', boxSizing: 'border-box', marginBottom: '8px' }} />
              {foodSearch.trim() && (() => {
                const term = foodSearch.trim();
                const matches = allFoodItems.filter(f => f.toLowerCase().includes(term.toLowerCase()) && !foodEntries.find(e => e.name === f));
                const isNew = !allFoodItems.some(f => f.toLowerCase() === term.toLowerCase());
                return (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {matches.map(f => (
                      <button key={f} onClick={() => addFoodEntry(f)}
                        style={{ padding: '5px 12px', backgroundColor: '#F5F5F0', color: '#333', border: '1px solid #8C8C8C', borderRadius: '16px', cursor: 'pointer', fontSize: '0.85rem', fontFamily: "'Sorts Mill Goudy', Georgia, serif" }}>
                        {f}
                      </button>
                    ))}
                    {isNew && (
                      <button onClick={() => addCustomFoodItem(term)}
                        style={{ padding: '5px 12px', backgroundColor: '#E2D4B8', color: '#2D6A4F', border: '1px solid #4A9B73', borderRadius: '16px', cursor: 'pointer', fontSize: '0.85rem', fontFamily: "'Sorts Mill Goudy', Georgia, serif", fontStyle: 'italic' }}>
                        + Add item
                      </button>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Entries list */}
            {foodEntries.length > 0 && (
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '0.85rem', color: '#8C8C8C', marginBottom: '8px', fontFamily: "'Philosopher', sans-serif" }}>
                  Added items — time and meal are optional
                </div>
                {foodEntries.map((entry, idx) => (
                  <div key={idx} style={{ backgroundColor: '#fff', borderRadius: '6px', padding: '10px 12px', marginBottom: '8px', border: '1px solid #e5e7eb' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontFamily: "'Sorts Mill Goudy', Georgia, serif", fontWeight: '600', color: '#333' }}>{entry.name}</span>
                      <button onClick={() => removeFoodEntry(idx)}
                        style={{ background: 'none', border: 'none', color: '#8C8C8C', cursor: 'pointer', fontSize: '1rem', padding: '0 4px' }}>✕</button>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <select value={entry.bucket} onChange={e => updateFoodEntry(idx, 'bucket', e.target.value)}
                        style={{ flex: 1, padding: '5px 8px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '0.8rem', color: entry.bucket ? '#333' : '#8C8C8C' }}>
                        <option value="">Meal type...</option>
                        {MEAL_BUCKETS.map(b => <option key={b} value={b}>{b}</option>)}
                      </select>
                      <select value={entry.time} onChange={e => updateFoodEntry(idx, 'time', e.target.value)}
                        style={{ flex: 1, padding: '5px 8px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '0.8rem', color: entry.time ? '#333' : '#8C8C8C' }}>
                        <option value="">Time...</option>
                        {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => { setShowFoodModal(false); setFoodEntries([]); setFoodSearch(''); }}
                style={{ flex: 1, padding: '12px', backgroundColor: 'transparent', color: '#8C8C8C', border: '1px solid #d1d5db', borderRadius: '4px', cursor: 'pointer', fontFamily: "'Philosopher', sans-serif" }}>
                Cancel
              </button>
              <button onClick={saveFood} disabled={!foodEntries.length}
                style={{ flex: 2, padding: '12px', backgroundColor: foodEntries.length ? '#2D6A4F' : '#d1d5db', color: '#fff', border: 'none', borderRadius: '4px', cursor: foodEntries.length ? 'pointer' : 'not-allowed', fontFamily: "'Philosopher', sans-serif", fontWeight: '600', fontSize: '1rem' }}>
                Save {foodEntries.length > 0 ? `(${foodEntries.length} item${foodEntries.length > 1 ? 's' : ''})` : ''}
              </button>
            </div>
          </div>
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