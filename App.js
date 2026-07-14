// iGym — main app component.
// Architecture:
//   App.js          → providers (StripeProvider + ErrorBoundary) + IGymApp
//   lib/*           → all data, helpers, AI, and DB
//   components/*    → cross-cutting components

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  SafeAreaView, TextInput, ScrollView, ImageBackground, StatusBar,
  KeyboardAvoidingView, Platform, Modal, Image, Alert, ActivityIndicator,
  Switch, Linking, Animated, Easing, RefreshControl, Share,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import MapView, { Marker, Circle } from 'react-native-maps';
import QRCode from 'react-native-qrcode-svg';
import { StripeProvider, useStripe } from '@stripe/stripe-react-native';

import env from './lib/env';
import {
  CLASS_TYPES, EQUIP_CATEGORIES, PLAN_TIERS, US_STATES, PRESET_PASSES,
  DEFAULT_LOCATION, PLATFORM_FEE_RATE, MEMBER_PREMIUM_PRICE, BRAND_WEBSITES,
} from './lib/constants';
import {
  getDistanceMiles, getAvgRating, renderStars, isOpenNow, getAIMatchScore,
  runLocalMatch, uniqueId, getActivePromotion, computeCheckinStats,
} from './lib/helpers';
import {
  loadUsers, upsertUser, loginUser as dbLoginUser, registerUser as dbRegisterUser,
  loadGyms, upsertGym, loginOwner as dbLoginOwner,
  addGymReview, recordPassSale, savePass, loadUserPasses, updatePass, deletePass,
  getPassById, seedRealGymsIfNeeded, loadGymPasses, redeemReferral, redeemGymReferral, incrementMatchImpressions,
  recordCheckin, loadUserCheckins,
} from './lib/supabase';
import { matchmakerSearch, identifyEquipmentFromImage, searchEquipmentOnWeb, AIError } from './lib/ai';
import { sendPushNotifications } from './lib/push';
import { GLOBAL_EQUIPMENT_DATABASE } from './lib/equipment-db';
import { INITIAL_OWNER_DATA, REAL_GYMS_DATA } from './lib/gyms-seed';
import ErrorBoundary from './components/ErrorBoundary';

// Foreground notifications still show a banner/alert instead of being silently queued.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true, shouldPlaySound: false, shouldSetBadge: false,
  }),
});

// Best-effort push token registration — never blocks login if it fails
// (simulators, denied permissions, and missing EAS project config all no-op here).
async function registerForPushToken() {
  try {
    if (!Constants.isDevice && Platform.OS !== 'web') { /* still try — some simulators support it */ }
    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (status !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== 'granted') return null;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const tokenResponse = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    return tokenResponse.data;
  } catch (e) {
    console.warn('[push] registration skipped:', e.message || e);
    return null;
  }
}

function IGymApp() {
  // --- Persisted databases (in-memory mirror of Supabase) ---
  const [userDatabase, setUserDatabase] = useState([]);
  const [ownerDatabase, setOwnerDatabase] = useState([]);
  const [isReady, setIsReady] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // --- Screen + transition ---
  const [currentScreen, setCurrentScreen] = useState('SPLASH');
  const fadeAnim  = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;
  const navigateTo = useCallback((screen) => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 0, duration: 120, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
      Animated.timing(slideAnim, { toValue: 18, duration: 120, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
    ]).start(() => {
      setCurrentScreen(screen);
      slideAnim.setValue(-18);
      Animated.parallel([
        Animated.timing(fadeAnim,  { toValue: 1, duration: 180, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
        Animated.timing(slideAnim, { toValue: 0, duration: 180, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
      ]).start();
    });
  }, [fadeAnim, slideAnim]);

  // --- App selection state ---
  const [currentUser, setCurrentUser] = useState(null);
  const [currentOwner, setCurrentOwner] = useState(null);
  const [selectedGym, setSelectedGym] = useState(null);
  const [selectedEquipment, setSelectedEquipment] = useState(null);
  const [selectedTrainer, setSelectedTrainer] = useState(null);
  const [equipFilter, setEquipFilter] = useState('All');
  const [selectedGlobalBrand, setSelectedGlobalBrand] = useState(null);

  // --- Payment / pass ---
  const [selectedPass, setSelectedPass] = useState(null);
  const [selectedPassStartDate, setSelectedPassStartDate] = useState(new Date());
  const [viewingQR, setViewingQR] = useState(null);
  const [cardDetails, setCardDetails] = useState({ number:'', exp:'', cvv:'', name:'' });
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  // --- AI matchmaker ---
  const [aiPrompt, setAiPrompt] = useState('');
  const [isAiFiltering, setIsAiFiltering] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [tempApiKey, setTempApiKey] = useState('');
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [aiMatchResults, setAiMatchResults] = useState({});
  const [aiSummary, setAiSummary] = useState('');
  const [aiSuggestions, setAiSuggestions] = useState([]);
  const [expandedMatchId, setExpandedMatchId] = useState(null);
  const [aiError, setAiError] = useState('');
  const [usingRealAI, setUsingRealAI] = useState(false);
  const [lastSearchTurn, setLastSearchTurn] = useState(null); // { prompt, summary } of the previous search, for refinement

  // --- AI equipment identification ---
  const [isIdentifyingEquip, setIsIdentifyingEquip] = useState(false);
  const [equipIdentifyError, setEquipIdentifyError] = useState('');
  const [equipIdentifyResults, setEquipIdentifyResults] = useState(null);

  // --- Equipment search ---
  const [equipSearchQuery, setEquipSearchQuery] = useState('');
  const [equipSearchBrandFilter, setEquipSearchBrandFilter] = useState('All');
  const [equipSearchResults, setEquipSearchResults] = useState([]);
  const [isEquipSearching, setIsEquipSearching] = useState(false);
  const [equipSearchError, setEquipSearchError] = useState('');
  const [equipSearchMode, setEquipSearchMode] = useState('LOCAL');

  // --- Monetization ---
  const [memberIsPremium, setMemberIsPremium] = useState(false);
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);

  // --- Map + search ---
  const [userLocation, setUserLocation] = useState(DEFAULT_LOCATION);
  const [customSearchAddress, setCustomSearchAddress] = useState('');
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [viewMode, setViewMode] = useState('LIST');
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchFilters, setSearchFilters] = useState({
    radius:'15', maxPrice:'', reqEquipCategory:'All',
    reqMinWeight:'', reqMaxWeight:'', reqClass:'All', targetMuscle:'', openNow: false,
  });
  const [gymSortBy, setGymSortBy] = useState('DISTANCE');

  // --- Tabs ---
  const [ownerTab, setOwnerTab] = useState('DESK');
  const [customerTab, setCustomerTab] = useState('FIND_GYM');

  // --- Owner scan log (session-only, not persisted) ---
  const [ownerScanLog, setOwnerScanLog] = useState([]);

  // --- Member check-in streak ---
  const [memberCheckins, setMemberCheckins] = useState([]);

  // --- Owner members (passes at this gym) ---
  const [ownerMembers, setOwnerMembers] = useState([]);
  const [ownerMembersLoading, setOwnerMembersLoading] = useState(false);

  // --- Forms ---
  const [editEquipData, setEditEquipData] = useState({});
  const [infoForm, setInfoForm] = useState({});
  const [profileEditForm, setProfileEditForm] = useState({});
  const [isSavingGeo, setIsSavingGeo] = useState(false);
  const [scannerInput, setScannerInput] = useState('');
  const [customClassInput, setCustomClassInput] = useState('');
  const [newTrainer, setNewTrainer] = useState({ name:'', fee:'', bio:'' });
  const [gymReviewText, setGymReviewText] = useState('');
  const [gymReviewRating, setGymReviewRating] = useState(5);
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [ownerIDInput, setOwnerIDInput] = useState('');
  const [ownerPassInput, setOwnerPassInput] = useState('');
  const [reviewInput, setReviewInput] = useState('');
  const [regData, setRegData] = useState({ firstName:'', lastName:'', username:'', password:'', email:'', address:'', city:'', state:'Select State', zip:'', referredBy:'' });
  const [ownerRegData, setOwnerRegData] = useState({ gymName:'', ownerID:'', password:'', email:'', businessTaxID:'', referredBy:'' });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [datePickerField, setDatePickerField] = useState('mfgDate');
  const [showStateMenu, setShowStateMenu] = useState(false);
  const [stateMenuTarget, setStateMenuTarget] = useState('REG');
  const [newPassLabel, setNewPassLabel] = useState('');
  const [newPassPrice, setNewPassPrice] = useState('');
  const [newPassType, setNewPassType] = useState('TIME');
  const [newPassValue, setNewPassValue] = useState('');
  const [newPromoTitle, setNewPromoTitle] = useState('');
  const [newPromoDetail, setNewPromoDetail] = useState('');
  const [newPromoDays, setNewPromoDays] = useState('7');

  useEffect(() => { if (currentUser) setProfileEditForm(currentUser); }, [currentUser]);

  useEffect(() => {
    if (!currentUser?.id) { setMemberCheckins([]); return; }
    loadUserCheckins(currentUser.id).then(setMemberCheckins);
  }, [currentUser?.id]);

  // --- BOOT ---
  useEffect(() => {
    const loadData = async () => {
      try {
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({});
          setUserLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
        }
        const savedApiKey = await AsyncStorage.getItem('@anthropic_api_key');
        if (savedApiKey) { setApiKey(savedApiKey); setTempApiKey(savedApiKey); }

        const [users, gyms] = await Promise.all([loadUsers(), loadGyms()]);

        if (gyms.length === 0) {
          await seedRealGymsIfNeeded(REAL_GYMS_DATA);
          for (const owner of INITIAL_OWNER_DATA) await upsertGym(owner);
          setOwnerDatabase(await loadGyms());
        } else {
          setOwnerDatabase(gyms);
        }

        if (users.length === 0) {
          const { user } = await dbRegisterUser({
            id: 'admin1', username: 'admin', password: '123',
            email: 'admin@igym.com', firstName: 'Coach', lastName: '',
            phone: '', address: '', city: '', state: '', zip: '',
            favorites: [], activePasses: [],
          });
          setUserDatabase([user].filter(Boolean));
        } else {
          setUserDatabase(users);
        }

        const activeUserJson  = await AsyncStorage.getItem('@active_user');
        const activeOwnerJson = await AsyncStorage.getItem('@active_owner');
        if (activeUserJson) {
          const cached = JSON.parse(activeUserJson);
          const passes = await loadUserPasses(cached.id);
          const restoredUser = { ...cached, activePasses: passes };
          setCurrentUser(restoredUser);
          setCurrentScreen('GYM_NETWORK');
          registerForPushToken().then(pushToken => {
            if (pushToken && pushToken !== cached.pushToken) upsertUser({ ...restoredUser, pushToken });
          });
        } else if (activeOwnerJson) {
          const cached = JSON.parse(activeOwnerJson);
          const freshOwner = (gyms || []).find(o => o.id === cached.id) || cached;
          setCurrentOwner(freshOwner); setInfoForm(freshOwner);
          setCurrentScreen('OWNER_DASHBOARD');
        }
      } catch (e) {
        console.error('Boot error:', e);
      } finally {
        setIsReady(true);
      }
    };
    loadData();
  }, []);

  // Pull-to-refresh handler for the gym list
  const refreshGyms = useCallback(async () => {
    setRefreshing(true);
    try {
      const gyms = await loadGyms();
      setOwnerDatabase(gyms);
      if (currentUser) {
        const passes = await loadUserPasses(currentUser.id);
        const updated = { ...currentUser, activePasses: passes };
        setCurrentUser(updated);
        await AsyncStorage.setItem('@active_user', JSON.stringify(updated));
      }
    } finally {
      setRefreshing(false);
    }
  }, [currentUser]);

  // ─── Helpers that depend on state ─────────────────────────────
  const isFavorite = useCallback((gymId) => (currentUser?.favorites || []).includes(gymId), [currentUser]);

  const toggleFavorite = async (gymId) => {
    if (!currentUser) return;
    const current = currentUser.favorites || [];
    const updated = current.includes(gymId) ? current.filter(id => id !== gymId) : [...current, gymId];
    const updatedUser = { ...currentUser, favorites: updated };
    setCurrentUser(updatedUser);
    setUserDatabase(prev => prev.map(u => u.id === currentUser.id ? updatedUser : u));
    await upsertUser(updatedUser);
    await AsyncStorage.setItem('@active_user', JSON.stringify(updatedUser));
  };

  // Replace owner in-memory cache + persist to Supabase atomically
  const persistOwner = async (updatedOwner) => {
    setOwnerDatabase(prev => prev.map(o => o.id === updatedOwner.id ? updatedOwner : o));
    setCurrentOwner(updatedOwner);
    setInfoForm(updatedOwner);
    await upsertGym(updatedOwner);
    await AsyncStorage.setItem('@active_owner', JSON.stringify(updatedOwner));
  };

  // Replace user in-memory cache + persist to Supabase
  const persistUser = async (updatedUser) => {
    setCurrentUser(updatedUser);
    setUserDatabase(prev => prev.map(u => u.id === updatedUser.id ? updatedUser : u));
    await upsertUser(updatedUser);
    await AsyncStorage.setItem('@active_user', JSON.stringify(updatedUser));
  };

  // --- Stripe ---
  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  // ─── Handlers ─────────────────────────────────────────────────
  const submitGymReview = async () => {
    if (!gymReviewText.trim()) return Alert.alert('Missing Review', 'Please write something before submitting.');
    if (!selectedGym) return;
    const newReview = {
      id: uniqueId('gr_'), userId: currentUser.id, username: currentUser.username,
      rating: gymReviewRating, text: gymReviewText.trim(), date: new Date().toISOString(),
    };
    const updatedGym = { ...selectedGym, gymReviews: [newReview, ...(selectedGym.gymReviews || [])] };
    await addGymReview(selectedGym.id, newReview);
    setOwnerDatabase(prev => prev.map(g => g.id === selectedGym.id ? updatedGym : g));
    setSelectedGym(updatedGym);
    setGymReviewText(''); setGymReviewRating(5);
    Alert.alert('Review Posted!', 'Thanks for sharing your experience.');
  };

  // Front desk QR scanner — looks up pass directly from DB (no stale cache)
  const handleDeskScan = async () => {
    if (!scannerInput.trim()) return;
    const code = scannerInput.trim().toUpperCase();
    setScannerInput('');
    const pass = await getPassById(code);

    const logEntry = (status, note) => ({
      passId: code,
      userId: pass?.userId || '—',
      label: pass?.label || code,
      time: new Date().toLocaleTimeString(),
      status,
      note,
    });

    if (!pass) {
      setOwnerScanLog(prev => [logEntry('INVALID', 'QR code not found'), ...prev.slice(0, 49)]);
      return Alert.alert('Invalid Pass 🔴', 'This QR code does not exist.');
    }
    if (pass.gymId !== currentOwner.id) {
      setOwnerScanLog(prev => [logEntry('WRONG_GYM', `Valid for ${pass.gymName}`), ...prev.slice(0, 49)]);
      return Alert.alert('Wrong Location 🔴', `Pass is valid for ${pass.gymName}, not your facility.`);
    }
    if (pass.startsAt && new Date(pass.startsAt) > new Date()) {
      setOwnerScanLog(prev => [logEntry('NOT_YET_ACTIVE', `Starts ${new Date(pass.startsAt).toLocaleDateString()}`), ...prev.slice(0, 49)]);
      return Alert.alert('Not Yet Active 🟡', `This pass starts ${new Date(pass.startsAt).toLocaleDateString()}.`);
    }
    if (pass.expiresAt && new Date(pass.expiresAt) < new Date()) {
      setOwnerScanLog(prev => [logEntry('EXPIRED', 'Pass expired'), ...prev.slice(0, 49)]);
      return Alert.alert('Pass Expired 🔴', 'This pass has expired.');
    }

    if (pass.remainingPunches != null) {
      if (pass.remainingPunches <= 0) {
        setOwnerScanLog(prev => [logEntry('EMPTY', 'No scans remaining'), ...prev.slice(0, 49)]);
        return Alert.alert('Empty 🔴', 'No scans remaining.');
      }
      const next = pass.remainingPunches - 1;
      await updatePass(pass.id, { remainingPunches: next });
      recordCheckin(pass.userId, pass.gymId);
      setOwnerScanLog(prev => [logEntry('GRANTED', `${next} scans remaining`), ...prev.slice(0, 49)]);
      Alert.alert('Access Granted 🟢', `Checked in.\nScans remaining: ${next}`);
    } else {
      recordCheckin(pass.userId, pass.gymId);
      setOwnerScanLog(prev => [logEntry('GRANTED', 'Time pass'), ...prev.slice(0, 49)]);
      Alert.alert('Access Granted 🟢', 'Valid time-based pass.');
    }
  };

  const handleAddCustomClass = () => {
    if (!customClassInput.trim()) return;
    const classes = infoForm.classes || [];
    if (!classes.includes(customClassInput.trim())) setInfoForm(prev => ({ ...prev, classes: [...classes, customClassInput.trim()] }));
    setCustomClassInput('');
  };

  const handleAddTrainer = async () => {
    if (!newTrainer.name || !newTrainer.fee) return Alert.alert('Error', 'Name and fee required.');
    const trainerObj = { id: uniqueId('t_'), name: newTrainer.name, fee: parseFloat(newTrainer.fee), bio: newTrainer.bio };
    const updatedTrainers = [...(infoForm.trainers || []), trainerObj];
    const updated = { ...currentOwner, ...infoForm, trainers: updatedTrainers };
    setNewTrainer({ name:'', fee:'', bio:'' });
    await persistOwner(updated);
  };

  const handleRemoveTrainer = async (id) => {
    const updatedTrainers = (infoForm.trainers || []).filter(t => t.id !== id);
    const updated = { ...currentOwner, ...infoForm, trainers: updatedTrainers };
    await persistOwner(updated);
  };

  const [bookingMessage, setBookingMessage] = useState('');

  const handleSubmitBooking = async () => {
    if (!bookingMessage.trim()) return Alert.alert('Missing Info', 'Describe your goals and preferred times.');
    const request = {
      id: uniqueId('b_'),
      trainerId: selectedTrainer.id,
      trainerName: selectedTrainer.name,
      gymId: selectedGym.id,
      gymName: selectedGym.gymName,
      userId: currentUser.id,
      username: currentUser.username,
      message: bookingMessage.trim(),
      status: 'PENDING',
      requestedAt: new Date().toISOString(),
    };
    // Save booking request to the gym owner's record
    const currentRequests = ownerDatabase.find(g => g.id === selectedGym.id)?.bookingRequests || [];
    const updatedGym = {
      ...ownerDatabase.find(g => g.id === selectedGym.id),
      bookingRequests: [request, ...currentRequests],
    };
    await upsertGym(updatedGym);
    setOwnerDatabase(prev => prev.map(g => g.id === updatedGym.id ? updatedGym : g));
    setBookingMessage('');
    Alert.alert('Request Sent! ✓', `Your booking request has been sent to ${selectedTrainer.name}. They'll contact you at ${currentUser.email}.`, [
      { text: 'OK', onPress: () => navigateTo('GYM_DETAIL') },
    ]);
  };

  const handleAddPassToRepository = async () => {
    if (!newPassLabel || !newPassPrice || !newPassValue) return Alert.alert('Incomplete', 'Provide tier name, price, and duration/scan limit.');
    const passObj = { id: uniqueId('p_'), label: newPassLabel, price: parseFloat(newPassPrice)||0, type: newPassType, value: parseInt(newPassValue)||1 };
    const newPasses = [...(infoForm.passes||[]), passObj];
    const updated = { ...currentOwner, ...infoForm, passes: newPasses };
    setNewPassLabel(''); setNewPassPrice(''); setNewPassValue('');
    await persistOwner(updated);
  };

  const handleRemovePassFromRepository = async (id) => {
    const newPasses = (infoForm.passes||[]).filter(p => p.id !== id);
    const updated = { ...currentOwner, ...infoForm, passes: newPasses };
    await persistOwner(updated);
  };

  const handleAddPromotion = async () => {
    if (!newPromoTitle.trim()) return Alert.alert('Incomplete', 'Give your promotion a title, e.g. "20% off day passes".');
    const days = parseInt(newPromoDays) || 7;
    const promoObj = {
      id: uniqueId('promo_'),
      title: newPromoTitle.trim(),
      detail: newPromoDetail.trim(),
      startDate: new Date().toISOString(),
      endDate: new Date(Date.now() + days * 86400000).toISOString(),
    };
    const newPromotions = [promoObj, ...(infoForm.promotions||[])];
    const updated = { ...currentOwner, ...infoForm, promotions: newPromotions };
    setNewPromoTitle(''); setNewPromoDetail(''); setNewPromoDays('7');
    await persistOwner(updated);
    Alert.alert('Promotion live', `Members will see "${promoObj.title}" for the next ${days} days.`);

    const interestedMembers = userDatabase.filter(u => (u.favorites||[]).includes(currentOwner.id) && u.pushToken);
    if (interestedMembers.length > 0) {
      sendPushNotifications(interestedMembers.map(u => ({
        to: u.pushToken,
        title: `🔥 New offer at ${updated.gymName}`,
        body: promoObj.title,
      })));
    }
  };

  const handleRemovePromotion = async (id) => {
    const newPromotions = (infoForm.promotions||[]).filter(p => p.id !== id);
    const updated = { ...currentOwner, ...infoForm, promotions: newPromotions };
    await persistOwner(updated);
  };

  const handlePaymentSubmit = async () => {
    setIsProcessingPayment(true);
    try {
      let clientSecret;
      try {
        const res = await fetch(`${env.BACKEND_URL}/create-payment-intent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: selectedPass?.price,
            gymName: selectedGym?.gymName,
            passLabel: selectedPass?.label,
            gymId: selectedGym?.id,
            userId: currentUser?.id,
          }),
        });
        const json = await res.json();
        if (json.error) throw new Error(json.error);
        clientSecret = json.clientSecret;
      } catch (backendErr) {
        console.warn('Backend unreachable, demo mode:', backendErr.message);
        clientSecret = null;
      }

      if (clientSecret && env.STRIPE_PUBLISHABLE) {
        const { error: initErr } = await initPaymentSheet({
          paymentIntentClientSecret: clientSecret,
          merchantDisplayName: 'iGym',
        });
        if (initErr) throw new Error(initErr.message);
        const { error: payErr } = await presentPaymentSheet();
        if (payErr) {
          setIsProcessingPayment(false);
          if (payErr.code !== 'Canceled') Alert.alert('Payment Failed', payErr.message);
          return;
        }
      }

      const startDate = selectedPassStartDate || new Date();
      let expiresAt = null, remainingPunches = null;
      if (selectedPass.type === 'TIME') {
        expiresAt = new Date(startDate.getTime() + (parseInt(selectedPass.value)||1) * 86400000);
      } else if (selectedPass.type === 'PUNCH') {
        remainingPunches = parseInt(selectedPass.value)||1;
        expiresAt = new Date(startDate.getTime() + 365 * 86400000);
      } else {
        expiresAt = new Date(startDate.getTime() + 30 * 86400000);
      }
      const platformFee = parseFloat((selectedPass.price * PLATFORM_FEE_RATE).toFixed(2));
      const gymReceives = parseFloat((selectedPass.price - platformFee).toFixed(2));
      const newPass = {
        id: 'QR-' + Math.random().toString(36).slice(2, 11).toUpperCase(),
        gymId: selectedGym.id, gymName: selectedGym.gymName,
        label: selectedPass.label, price: selectedPass.price,
        platformFee, gymReceives,
        type: selectedPass.type, value: selectedPass.value,
        purchasedAt: new Date().toISOString(),
        startsAt: startDate.toISOString(),
        expiresAt: expiresAt?.toISOString() || null,
        remainingPunches, totalPunches: remainingPunches,
        stripePaymentId: clientSecret ? clientSecret.split('_secret_')[0] : 'demo',
      };

      await savePass(newPass, currentUser.id);
      await recordPassSale(selectedGym.id, gymReceives, platformFee);

      const updatedPasses = [newPass, ...(currentUser.activePasses||[])];
      const updatedUser = { ...currentUser, activePasses: updatedPasses };
      setCurrentUser(updatedUser);
      await AsyncStorage.setItem('@active_user', JSON.stringify(updatedUser));

      const updatedGyms = await loadGyms();
      setOwnerDatabase(updatedGyms);
      if (currentOwner?.id === selectedGym.id) {
        const fresh = updatedGyms.find(g => g.id === selectedGym.id);
        if (fresh) { setCurrentOwner(fresh); setInfoForm(fresh); }
      }

      setIsProcessingPayment(false);
      setCardDetails({ number:'', exp:'', cvv:'', name:'' });
      setSelectedPassStartDate(new Date());
      setViewingQR(newPass);
      navigateTo('ACTIVE_PASS_VIEW');
    } catch (err) {
      console.error('[Payment]', err);
      setIsProcessingPayment(false);
      Alert.alert('Payment Error', err.message || 'Something went wrong. Please try again.');
    }
  };

  const handleMockGymScan = async (passId) => {
    const passes = currentUser.activePasses || [];
    const idx = passes.findIndex(p => p.id === passId);
    if (idx === -1) return;
    const pass = passes[idx];
    if (pass.startsAt && new Date(pass.startsAt) > new Date()) return Alert.alert('Not Yet Active', `This pass starts ${new Date(pass.startsAt).toLocaleDateString()}.`);
    if (pass.expiresAt && new Date(pass.expiresAt) < new Date()) return Alert.alert('Expired', 'This pass has expired.');
    let updatedPasses = [...passes];
    if (pass.remainingPunches != null) {
      if (pass.remainingPunches <= 0) return Alert.alert('Empty', 'No scans remaining.');
      const next = pass.remainingPunches - 1;
      updatedPasses[idx] = { ...pass, remainingPunches: next };
      await updatePass(pass.id, { remainingPunches: next });
      Alert.alert('Scan Successful', `Access granted. ${next} scans remaining.`);
    } else {
      Alert.alert('Scan Successful', 'Valid time-based pass verified.');
    }
    recordCheckin(currentUser.id, pass.gymId);
    await persistUser({ ...currentUser, activePasses: updatedPasses });
    setViewingQR(updatedPasses[idx]);
  };

  const handleRemovePassFromWallet = async (passId) => {
    Alert.alert('Delete Pass', 'Remove this pass? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        await deletePass(passId);
        const updatedPasses = (currentUser.activePasses||[]).filter(p => p.id !== passId);
        await persistUser({ ...currentUser, activePasses: updatedPasses });
        setViewingQR(null);
        navigateTo('GYM_NETWORK');
      }},
    ]);
  };

  const handleLocationSearch = async () => {
    if (!customSearchAddress.trim()) return Alert.alert('Required', 'Enter a city, zip, or address.');
    setIsGeocoding(true);
    try {
      const result = await Location.geocodeAsync(customSearchAddress);
      if (result.length > 0) {
        setUserLocation({ latitude: result[0].latitude, longitude: result[0].longitude });
        Alert.alert('Location Updated', `Searching near: ${customSearchAddress}`);
        setShowSearchModal(false);
      } else Alert.alert('Not Found', 'Could not find that location.');
    } catch { Alert.alert('Error', 'Could not find that location.'); }
    finally { setIsGeocoding(false); }
  };

  const resetToCurrentLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({});
        setUserLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
        setCustomSearchAddress('');
        Alert.alert('Location Reset', 'Using your GPS location.');
      }
    } catch { Alert.alert('Error', 'Could not fetch GPS location.'); }
  };

  // ─── Auth ─────────────────────────────────────────────────────
  const handleLogin = async () => {
    if (!loginUser || !loginPass) return Alert.alert('Error', 'Enter username and password.');
    const user = await dbLoginUser(loginUser, loginPass);
    if (user) {
      const passes = await loadUserPasses(user.id);
      const u = { ...user, activePasses: passes };
      setCurrentUser(u); setCustomerTab('FIND_GYM');
      await AsyncStorage.setItem('@active_user', JSON.stringify(u));
      navigateTo('GYM_NETWORK');
      registerForPushToken().then(pushToken => {
        if (pushToken && pushToken !== user.pushToken) upsertUser({ ...u, pushToken });
      });
    } else {
      Alert.alert('Access Denied', 'Invalid username or password.');
    }
  };

  const handleRegister = async () => {
    const { firstName, lastName, username, password, email, address, city, state, zip, referredBy } = regData;
    if (!firstName||!lastName||!username||!password||!email||!address||!city||!zip||state==='Select State')
      return Alert.alert('Missing Info', 'All fields are required.');
    const referralCode = username.trim().toUpperCase().slice(0, 6) + (Date.now() % 1000);
    const result = await dbRegisterUser({
      username: username.trim().toLowerCase(), password: password.trim(),
      email: email.trim(), firstName, lastName, phone: '',
      address, city, state, zip, favorites: [], activePasses: [],
      referralCode, referredBy: referredBy.trim().toUpperCase() || null,
    });
    if (result.error) return Alert.alert('Error', result.error);
    if (referredBy.trim()) redeemReferral(referredBy.trim().toUpperCase());
    setUserDatabase(await loadUsers());
    Alert.alert('Success', 'Account created!', [{ text: 'Login', onPress: () => navigateTo('SPLASH') }]);
  };

  const shareReferralCode = () => {
    if (!currentUser?.referralCode) return;
    Share.share({
      message: `Come train with me on iGym! Enter my referral code ${currentUser.referralCode} when you sign up.`,
    }).catch(() => {});
  };

  const notifyUserPush = (userId, title, body) => {
    const target = userDatabase.find(u => u.id === userId);
    if (!target?.pushToken) return;
    sendPushNotifications([{ to: target.pushToken, title, body }]);
  };

  const shareOwnerReferralCode = () => {
    if (!currentOwner?.referralCode) return;
    Share.share({
      message: `List your gym on iGym! Use referral code ${currentOwner.referralCode} when you register your business.`,
    }).catch(() => {});
  };

  const saveCustomerProfile = async () => {
    const safe = { ...profileEditForm, username: profileEditForm.username?.trim().toLowerCase(), password: profileEditForm.password?.trim() };
    const merged = { ...currentUser, ...safe };
    await persistUser(merged);
    Alert.alert('Saved', 'Profile updated!');
  };

  const handleLogout = async () => {
    setCurrentUser(null); setLoginUser(''); setLoginPass(''); setCustomerTab('FIND_GYM');
    setIsAiFiltering(false); setAiPrompt('');
    await AsyncStorage.removeItem('@active_user');
    navigateTo('SPLASH');
  };

  const handleOwnerLogin = async () => {
    if (!ownerIDInput || !ownerPassInput) return Alert.alert('Error', 'Enter Management ID and Password.');
    const owner = await dbLoginOwner(ownerIDInput, ownerPassInput);
    if (owner) {
      setCurrentOwner(owner); setInfoForm(owner); setOwnerTab('DESK');
      await AsyncStorage.setItem('@active_owner', JSON.stringify(owner));
      navigateTo('OWNER_DASHBOARD');
    } else {
      Alert.alert('Unauthorized', 'Invalid management credentials.');
    }
  };

  const handleOwnerRegister = async () => {
    const { gymName, ownerID, password, email, businessTaxID, referredBy } = ownerRegData;
    if (!gymName||!ownerID||!password||!email||!businessTaxID)
      return Alert.alert('Missing Info', 'All business credentials required.');
    const newOwner = {
      id: uniqueId('o_'), ownerID: ownerID.trim().toLowerCase(),
      password: password.trim(), email: email.trim(), businessTaxID: businessTaxID.trim(),
      gymName: gymName.trim(), name: gymName.trim(), location:'', phone:'', website:'',
      pricing:'', monthlyPrice:0, dayPassPrice:0, description:'', classes:[], equipment:[],
      passes:[], trainers:[], gymReviews:[], openHour:6, closeHour:22, hoursDisplay:'',
      lat: DEFAULT_LOCATION.latitude, lon: DEFAULT_LOCATION.longitude,
      plan: 'free', featured: false, promotions: [], matchImpressions: 0,
      referralCode: ownerID.trim().toUpperCase().slice(0,6) + (Date.now() % 1000),
      referralCount: 0, referralRevenue: 0, totalPassRevenue: 0, platformFeesPaid: 0, monthlyPassSales: 0,
    };
    await upsertGym(newOwner);
    if (referredBy?.trim()) redeemGymReferral(referredBy.trim().toUpperCase());
    setOwnerDatabase(await loadGyms());
    Alert.alert('Created', 'Business account created!', [{ text: 'Login', onPress: () => navigateTo('OWNER_LOGIN') }]);
  };

  const handleOwnerLogout = async () => {
    setCurrentOwner(null); setInfoForm({}); setOwnerIDInput(''); setOwnerPassInput(''); setOwnerTab('DESK');
    await AsyncStorage.removeItem('@active_owner');
    navigateTo('SPLASH');
  };

  const saveGymProfile = async () => {
    setIsSavingGeo(true);
    let lat = currentOwner.lat, lon = currentOwner.lon;
    if (infoForm.location) {
      try {
        const geo = await Location.geocodeAsync(infoForm.location);
        if (geo.length > 0) { lat = geo[0].latitude; lon = geo[0].longitude; }
      } catch (e) { /* keep existing coords */ }
    }
    const updated = { ...currentOwner, ...infoForm, name: infoForm.gymName, lat, lon };
    await persistOwner(updated);
    setIsSavingGeo(false);
    Alert.alert('Saved', 'Gym profile updated!');
  };

  const saveNewEquipment = async () => {
    if (!editEquipData.name) return Alert.alert('Error', 'Equipment name required.');
    const newEq = { ...editEquipData, id: uniqueId('e_') };
    const updated = { ...currentOwner, equipment: [newEq, ...(currentOwner.equipment||[])] };
    await persistOwner(updated);
    Alert.alert('Added', 'Equipment added to inventory!');
    navigateTo('OWNER_DASHBOARD');
  };

  const saveEquipmentEdit = async () => {
    if (!editEquipData.name) return Alert.alert('Error', 'Name required.');
    const updated = { ...currentOwner, equipment: (currentOwner.equipment||[]).map(eq => eq.id === editEquipData.id ? editEquipData : eq) };
    await persistOwner(updated);
    Alert.alert('Saved', 'Equipment updated!');
    navigateTo('OWNER_DASHBOARD');
  };

  const deleteEquipment = () => {
    Alert.alert('Delete Equipment', 'Permanently remove this from your database?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        const updated = { ...currentOwner, equipment: (currentOwner.equipment||[]).filter(eq => eq.id !== editEquipData.id) };
        await persistOwner(updated);
        Alert.alert('Deleted', 'Equipment removed.');
        navigateTo('OWNER_DASHBOARD');
      }},
    ]);
  };

  const pickEditMedia = async (field, isVideo = false) => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: isVideo ? ImagePicker.MediaTypeOptions.Videos : ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, quality: 1,
    });
    if (!result.canceled) setEditEquipData(prev => ({ ...prev, [field]: result.assets[0].uri }));
  };

  // ─── AI equipment identifier ─────────────────────────────────
  const identifyEquipmentWithAI = async (imageUri) => {
    if (!apiKey) return Alert.alert('🔑 API Key Required', 'Add your Anthropic API key to use AI equipment identification.', [
      { text: 'Add Key Now', onPress: () => setShowApiKeyModal(true) },
      { text: 'Cancel', style: 'cancel' },
    ]);
    setIsIdentifyingEquip(true); setEquipIdentifyError(''); setEquipIdentifyResults(null);
    try {
      const fetchResp = await fetch(imageUri);
      const blob = await fetchResp.blob();
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      const mediaType = imageUri.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
      const parsed = await identifyEquipmentFromImage({ apiKey, base64, mediaType });
      setEquipIdentifyResults(parsed);
      setEditEquipData(prev => ({
        ...prev,
        name:         parsed.name         || prev.name         || '',
        category:     parsed.category     || prev.category     || '',
        targetArea:   parsed.targetArea   || prev.targetArea   || '',
        minWeight:    parsed.minWeight    || prev.minWeight    || '',
        maxWeight:    parsed.maxWeight    || prev.maxWeight    || '',
        instructions: parsed.instructions || prev.instructions || '',
        workouts:     parsed.workouts     || prev.workouts     || [],
        description:  parsed.description  || prev.description  || '',
        maintenance:  parsed.maintenance  || prev.maintenance  || '',
      }));
    } catch (err) {
      console.error('Equipment ID error:', err);
      setEquipIdentifyError((err.message || 'Unknown error').slice(0, 150));
    } finally {
      setIsIdentifyingEquip(false);
    }
  };

  const pickAndIdentifyEquipment = async (source) => {
    try {
      let result;
      if (source === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (perm.status !== 'granted') return Alert.alert('Permission Required', 'Camera access is needed.');
        result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, quality: 0.85 });
      } else {
        result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, quality: 0.85 });
      }
      if (!result.canceled) {
        const uri = result.assets[0].uri;
        setEditEquipData(prev => ({ ...prev, image: uri }));
        setEquipIdentifyResults(null); setEquipIdentifyError('');
        await identifyEquipmentWithAI(uri);
      }
    } catch {
      Alert.alert('Error', 'Could not open camera or photo library.');
    }
  };

  // ─── Equipment search ─────────────────────────────────────────
  const runLocalEquipSearch = (query, brandFilter) => {
    const q = (query || '').trim().toLowerCase();
    return GLOBAL_EQUIPMENT_DATABASE.filter(item => {
      if (brandFilter !== 'All' && item.brand !== brandFilter) return false;
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.brand.toLowerCase().includes(q) ||
        item.targetArea?.toLowerCase().includes(q) ||
        item.category?.toLowerCase().includes(q) ||
        item.instructions?.toLowerCase().includes(q)
      );
    });
  };

  const runAIEquipSearch = async (query, brandFilter) => {
    if (!apiKey) return Alert.alert('API Key Required', 'Add your Anthropic API key to search the web.', [
      { text: 'Add Key', onPress: () => setShowApiKeyModal(true) },
      { text: 'Cancel', style: 'cancel' },
    ]);
    setIsEquipSearching(true); setEquipSearchError(''); setEquipSearchResults([]);
    try {
      const results = await searchEquipmentOnWeb({ apiKey, query, brand: brandFilter });
      setEquipSearchResults(results);
      if (results.length === 0) setEquipSearchError('No results found. Try a different search term.');
    } catch (err) {
      setEquipSearchError(`Search failed: ${(err.message||'').slice(0, 80)}`);
    } finally {
      setIsEquipSearching(false);
    }
  };

  const handleEquipSearch = () => {
    const q = equipSearchQuery.trim();
    if (!q && equipSearchBrandFilter === 'All') return;
    if (equipSearchMode === 'AI') runAIEquipSearch(q, equipSearchBrandFilter);
    else setEquipSearchResults(runLocalEquipSearch(q, equipSearchBrandFilter));
  };

  const addSearchResultToInventory = (item) => {
    Alert.alert('Add to Inventory', `Add "${item.name}" to your inventory?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Add Directly', onPress: async () => {
        const newEq = { ...item, id: uniqueId('e_'), image: item.image||'', muscleDiagram:'', videoThumbnail:'', mfgDate:'', serviceDate:'', reviews:[] };
        const updated = { ...currentOwner, equipment: [newEq, ...(currentOwner.equipment||[])] };
        await persistOwner(updated);
        Alert.alert('Added ✓', `${item.name} has been added.`);
      }},
      { text: 'Review & Edit First', onPress: () => {
        setEditEquipData({
          name: item.name||'', brand: item.brand||'', category: item.category||'',
          targetArea: item.targetArea||'', minWeight: item.minWeight||'', maxWeight: item.maxWeight||'',
          instructions: item.instructions||'', description: item.description||'',
          image: item.image||'', muscleDiagram:'', videoThumbnail:'',
          mfgDate:'', serviceDate:'', reviews:[],
        });
        navigateTo('OWNER_EQUIP_ADD');
      }},
    ]);
  };

  // ─── Plan / subscription ─────────────────────────────────────
  const getOwnerPlan = (owner) => owner?.plan || 'free';
  const planAllows   = (owner, feature) => !!(PLAN_TIERS[getOwnerPlan(owner)]?.limits?.[feature]);

  const handleUpgradePlan = (newPlan) => {
    Alert.alert(
      `Upgrade to ${PLAN_TIERS[newPlan].name}`,
      `$${PLAN_TIERS[newPlan].price}/month billed monthly.\n\n${PLAN_TIERS[newPlan].features.join('\n• ')}\n\nDemo: upgrade is instant.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: `Upgrade — $${PLAN_TIERS[newPlan].price}/mo`, onPress: async () => {
          await persistOwner({ ...currentOwner, plan: newPlan });
          setShowSubscriptionModal(false);
          Alert.alert('🎉 Upgraded!', `You're now on the ${PLAN_TIERS[newPlan].name} plan.`);
        }},
      ]
    );
  };

  const handleDowngradePlan = (newPlan) => {
    Alert.alert('Downgrade Plan', `Switch to ${PLAN_TIERS[newPlan].name} ($${PLAN_TIERS[newPlan].price}/mo)?`, [
      { text: 'Keep Current', style: 'cancel' },
      { text: 'Confirm Downgrade', style: 'destructive', onPress: async () => {
        await persistOwner({ ...currentOwner, plan: newPlan });
        setShowSubscriptionModal(false);
      }},
    ]);
  };

  const handleToggleFeatured = async () => {
    if (!planAllows(currentOwner, 'featured')) {
      Alert.alert('Pro Feature', 'Featured placement requires the Pro plan.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Upgrade to Pro', onPress: () => { setShowSubscriptionModal(false); handleUpgradePlan('pro'); } },
      ]); return;
    }
    await persistOwner({ ...currentOwner, featured: !currentOwner.featured });
  };

  const handleUpgradeMemberPremium = () => {
    Alert.alert('⚡ iGym Premium', `$${MEMBER_PREMIUM_PRICE}/month\n\n• AI Matchmaker\n• Personalized recs\n• Smart filters\n• Priority match scoring`, [
      { text: 'Not Now', style: 'cancel' },
      { text: `Subscribe`, onPress: () => {
        setMemberIsPremium(true); setShowPremiumModal(false);
        Alert.alert('🎉 Welcome to Premium!', 'AI Matchmaker unlocked.');
      }},
    ]);
  };

  const submitReview = async () => {
    if (!reviewInput.trim()) return Alert.alert('Hold on', 'Write a review first.');
    const newReview = { id: uniqueId('er_'), user: currentUser?.username||'Anonymous', text: reviewInput, rating: '⭐⭐⭐⭐⭐' };
    const updatedEquip = { ...selectedEquipment, reviews: [newReview, ...(selectedEquipment.reviews||[])] };
    setSelectedEquipment(updatedEquip);
    const updatedGym = { ...selectedGym, equipment: (selectedGym.equipment||[]).map(eq => eq.id === selectedEquipment.id ? updatedEquip : eq) };
    setOwnerDatabase(prev => prev.map(g => g.id === selectedGym.id ? updatedGym : g));
    setSelectedGym(updatedGym);
    await upsertGym(updatedGym);
    setReviewInput('');
  };

  const saveApiKey = async () => {
    const trimmed = tempApiKey.trim();
    if (!trimmed.startsWith('sk-ant-')) return Alert.alert('Invalid Key', 'Anthropic API keys begin with "sk-ant-".');
    setApiKey(trimmed);
    await AsyncStorage.setItem('@anthropic_api_key', trimmed);
    setShowApiKeyModal(false);
    Alert.alert('Key Saved ✓', 'Real AI matching enabled.');
  };

  const removeApiKey = async () => {
    Alert.alert('Remove Key', 'Disable real AI matching?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        setApiKey(''); setTempApiKey('');
        await AsyncStorage.removeItem('@anthropic_api_key');
        setShowApiKeyModal(false);
      }},
    ]);
  };

  const saveRecentSearch = (prompt) => {
    if (!currentUser) return;
    const current = currentUser.savedSearches || [];
    const updated = [prompt, ...current.filter(s => s.toLowerCase() !== prompt.toLowerCase())].slice(0, 5);
    persistUser({ ...currentUser, savedSearches: updated });
  };

  // isRefine=true carries the previous search's context into this one (via lastSearchTurn)
  // instead of starting from a blank slate — powers the "Refine" chip taps below.
  const runAISearch = async (promptText, isRefine = false) => {
    const trimmed = (promptText ?? aiPrompt).trim();
    if (!trimmed) return Alert.alert('Try it!', "Tell the AI what you're looking for.");
    setAiPrompt(trimmed);
    setIsAiLoading(true); setAiError('');
    if (!isRefine) { setAiSummary(''); setAiSuggestions([]); setAiMatchResults({}); setExpandedMatchId(null); setLastSearchTurn(null); }
    const previousTurn = isRefine ? lastSearchTurn : null;

    const finish = (matchMap, summary, suggestions, usingReal) => {
      setAiMatchResults(matchMap);
      setAiSummary(summary);
      setAiSuggestions(suggestions);
      setUsingRealAI(usingReal);
      setIsAiFiltering(true);
      setLastSearchTurn({ prompt: trimmed, summary });
      Object.keys(matchMap).forEach(gymId => incrementMatchImpressions(gymId));
      saveRecentSearch(trimmed);
    };

    if (apiKey) {
      try {
        const result = await matchmakerSearch({ apiKey, prompt: trimmed, gyms: ownerDatabase, previousTurn });
        const matchMap = {};
        (result.matches || []).forEach(m => { matchMap[m.gymId] = { score: m.score, reason: m.reason, highlights: m.highlights || [] }; });
        finish(matchMap, result.summary || '', result.suggestions || [], true);
      } catch (err) {
        console.warn('Claude API failed, falling back:', err.message);
        setAiError(`AI unavailable. Showing local results.`);
        finish(runLocalMatch(trimmed, ownerDatabase), '', [], false);
      }
    } else {
      await new Promise(r => setTimeout(r, 400));
      finish(runLocalMatch(trimmed, ownerDatabase), '', [], false);
    }
    setIsAiLoading(false);
  };

  const handleAISearch = () => runAISearch(aiPrompt, false);
  const handleRefineSearch = (suggestion) => runAISearch(suggestion, true);

  const handleForgotPassword = () => {
    if (!loginUser) return Alert.alert('Who are you?', 'Enter your username first.');
    Alert.alert('Recovery Email Sent', `A reset link has been sent to the email for ${loginUser}.`);
  };

  // Analytics derived data
  const getOwnerAnalytics = () => {
    if (!currentOwner) return {};
    const equipment = currentOwner.equipment || [];
    const passes = currentOwner.passes || [];
    const reviews = currentOwner.gymReviews || [];
    const trainers = currentOwner.trainers || [];
    const classes = currentOwner.classes || [];
    const equipByCategory = EQUIP_CATEGORIES.reduce((acc, cat) => {
      acc[cat] = equipment.filter(e => e.category === cat).length;
      return acc;
    }, {});
    return { equipment, passes, reviews, trainers, classes, equipByCategory, avgRating: getAvgRating(reviews) };
  };

  if (!isReady) return <View style={[styles.container, { justifyContent: 'center' }]}><ActivityIndicator size="large" color="#007AFF" /></View>;

  // ─── RENDER ─────────────────────────────────────────────────
  const renderScreen = () => {
    switch (currentScreen) {

      case 'SPLASH':
        return (
          <ImageBackground source={{ uri:'https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?q=80&w=2070' }} style={styles.fullScreen}>
            <View style={styles.overlay}>
              <Text style={styles.brandText}>iGym</Text>
              <Text style={styles.taglineText}>Finding the right gym, for you.</Text>
              <View style={styles.loginCard}>
                <TextInput style={styles.input} placeholder="Username" placeholderTextColor="#999" value={loginUser} onChangeText={setLoginUser} autoCapitalize="none"/>
                <TextInput style={styles.input} placeholder="Password" placeholderTextColor="#999" value={loginPass} secureTextEntry onChangeText={setLoginPass}/>
                <TouchableOpacity style={styles.primaryBtn} onPress={handleLogin}><Text style={styles.btnText}>Login</Text></TouchableOpacity>
              </View>
              <View style={styles.linkRow}>
                <TouchableOpacity onPress={() => navigateTo('REGISTER')}><Text style={styles.whiteLink}>New here? <Text style={styles.boldText}>Get Started</Text></Text></TouchableOpacity>
                <Text style={styles.separator}>|</Text>
                <TouchableOpacity onPress={handleForgotPassword}><Text style={styles.whiteLink}>Forgot Password?</Text></TouchableOpacity>
              </View>
              <TouchableOpacity onPress={() => navigateTo('OWNER_LOGIN')}><Text style={styles.ownerLinkText}>Gym Owner Portal →</Text></TouchableOpacity>
            </View>
          </ImageBackground>
        );

      case 'OWNER_LOGIN':
        return (
          <ImageBackground source={{ uri:'https://images.unsplash.com/photo-1540497077202-7c8a3999166f?q=80&w=2070' }} style={styles.fullScreen}>
            <View style={[styles.overlay,{backgroundColor:'rgba(0,0,0,0.85)'}]}>
              <TouchableOpacity onPress={() => navigateTo('SPLASH')}><Text style={styles.whiteLink}>← Back to Member Login</Text></TouchableOpacity>
              <Text style={[styles.brandText,{fontSize:40,marginTop:20}]}>Owner Portal</Text>
              <View style={styles.loginCard}>
                <TextInput style={styles.input} placeholder="Management ID" placeholderTextColor="#999" value={ownerIDInput} onChangeText={setOwnerIDInput} autoCapitalize="none"/>
                <TextInput style={styles.input} placeholder="Portal Password" placeholderTextColor="#999" value={ownerPassInput} secureTextEntry onChangeText={setOwnerPassInput}/>
                <TouchableOpacity style={[styles.primaryBtn,{backgroundColor:'#111'}]} onPress={handleOwnerLogin}><Text style={styles.btnText}>Authorize & Enter</Text></TouchableOpacity>
              </View>
              <View style={styles.linkRow}>
                <TouchableOpacity onPress={() => navigateTo('OWNER_REGISTER')}><Text style={styles.whiteLink}>Register Gym</Text></TouchableOpacity>
                <Text style={styles.separator}>|</Text>
                <TouchableOpacity onPress={() => Alert.alert('Security','Contact corporate IT for portal recovery.')}><Text style={styles.whiteLink}>Forgot ID/Password?</Text></TouchableOpacity>
              </View>
            </View>
          </ImageBackground>
        );

      case 'OWNER_REGISTER':
        return (
          <SafeAreaView style={styles.container}>
            <KeyboardAvoidingView behavior={Platform.OS==="ios"?"padding":"height"} style={{flex:1}}>
              <ScrollView contentContainerStyle={styles.padding} keyboardShouldPersistTaps="handled">
                <TouchableOpacity onPress={() => navigateTo('OWNER_LOGIN')}><Text style={styles.backLink}>← Back</Text></TouchableOpacity>
                <Text style={styles.header}>Business Registration</Text>
                <TextInput style={styles.input} placeholder="Legal Facility Name" onChangeText={t => setOwnerRegData(p=>({...p,gymName:t}))}/>
                <TextInput style={styles.input} placeholder="Business Email" keyboardType="email-address" onChangeText={t => setOwnerRegData(p=>({...p,email:t}))}/>
                <TextInput style={styles.input} placeholder="Business Tax ID (EIN)" onChangeText={t => setOwnerRegData(p=>({...p,businessTaxID:t}))}/>
                <Text style={styles.sectionLabel}>Access Credentials</Text>
                <TextInput style={styles.input} placeholder="Create Management ID" autoCapitalize="none" onChangeText={t => setOwnerRegData(p=>({...p,ownerID:t}))}/>
                <TextInput style={styles.input} placeholder="Create Portal Password" secureTextEntry onChangeText={t => setOwnerRegData(p=>({...p,password:t}))}/>
                <TextInput style={styles.input} placeholder="Referral Code (optional)" autoCapitalize="characters" value={ownerRegData.referredBy} onChangeText={t => setOwnerRegData(p=>({...p,referredBy:t}))}/>
                <TouchableOpacity style={[styles.primaryBtn,{backgroundColor:'#111'}]} onPress={handleOwnerRegister}><Text style={styles.btnText}>Submit Registration</Text></TouchableOpacity>
              </ScrollView>
            </KeyboardAvoidingView>
          </SafeAreaView>
        );

      case 'REGISTER':
        return (
          <SafeAreaView style={styles.container}>
            <KeyboardAvoidingView behavior={Platform.OS==="ios"?"padding":"height"} style={{flex:1}}>
              <ScrollView contentContainerStyle={styles.padding} keyboardShouldPersistTaps="handled">
                <TouchableOpacity onPress={() => navigateTo('SPLASH')}><Text style={styles.backLink}>← Back to Login</Text></TouchableOpacity>
                <Text style={styles.header}>Join iGym</Text>
                <TextInput style={styles.input} placeholder="First Name" onChangeText={t => setRegData(p=>({...p,firstName:t}))}/>
                <TextInput style={styles.input} placeholder="Last Name" onChangeText={t => setRegData(p=>({...p,lastName:t}))}/>
                <TextInput style={styles.input} placeholder="Email" keyboardType="email-address" onChangeText={t => setRegData(p=>({...p,email:t}))}/>
                <TextInput style={styles.input} placeholder="Address" onChangeText={t => setRegData(p=>({...p,address:t}))}/>
                <View style={styles.row}>
                  <TextInput style={[styles.input,{flex:1,marginRight:10}]} placeholder="City" onChangeText={t => setRegData(p=>({...p,city:t}))}/>
                  <TouchableOpacity style={[styles.input,{flex:1,marginRight:10,justifyContent:'center'}]} onPress={() => { setStateMenuTarget('REG'); setShowStateMenu(true); }}>
                    <Text style={{color:regData.state==='Select State'?'#999':'#000'}}>{regData.state}</Text>
                  </TouchableOpacity>
                  <TextInput style={[styles.input,{flex:1}]} placeholder="Zip" keyboardType="numeric" onChangeText={t => setRegData(p=>({...p,zip:t}))}/>
                </View>
                <TextInput style={styles.input} placeholder="Create Username" autoCapitalize="none" onChangeText={t => setRegData(p=>({...p,username:t}))}/>
                <TextInput style={styles.input} placeholder="Create Password" secureTextEntry onChangeText={t => setRegData(p=>({...p,password:t}))}/>
                <TextInput style={styles.input} placeholder="Referral Code (optional)" autoCapitalize="characters" value={regData.referredBy} onChangeText={t => setRegData(p=>({...p,referredBy:t}))}/>
                <TouchableOpacity style={styles.primaryBtn} onPress={handleRegister}><Text style={styles.btnText}>Create Account</Text></TouchableOpacity>
              </ScrollView>
            </KeyboardAvoidingView>
          </SafeAreaView>
        );

      case 'OWNER_DASHBOARD': {
        const activeEquipmentList = infoForm.equipment || [];
        const analytics = getOwnerAnalytics();
        const ownerPlan = getOwnerPlan(currentOwner);
        const planTier  = PLAN_TIERS[ownerPlan];
        return (
          <SafeAreaView style={styles.container}>
            <ScrollView contentContainerStyle={styles.padding} keyboardShouldPersistTaps="handled">
              <View style={styles.rowJustify}>
                <View style={{flex:1, marginRight:10}}>
                  <Text style={styles.header} numberOfLines={1}>Console: {infoForm?.gymName}</Text>
                  <TouchableOpacity
                    style={[styles.planPillBtn, {backgroundColor: planTier.color + '18', borderColor: planTier.color}]}
                    onPress={() => setShowSubscriptionModal(true)}
                  >
                    <Text style={{color: planTier.color, fontWeight:'800', fontSize:12}}>{planTier.emoji} {planTier.name} Plan</Text>
                    <Text style={{color: planTier.color, fontSize:11, marginLeft:6, opacity:0.8}}>Manage →</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity onPress={handleOwnerLogout}><Text style={styles.backLink}>Logout</Text></TouchableOpacity>
              </View>

              <View style={styles.tabRow}>
                {[['DESK','Desk'],['EQUIP','Inventory'],['INFO','Profile'],['TRAINERS','Trainers'],['MEMBERS','Members'],['ANALYTICS','Analytics']].map(([key,label]) => (
                  <TouchableOpacity key={key} style={[styles.tabBtn, ownerTab===key && styles.tabBtnActive]} onPress={async () => {
                    setOwnerTab(key);
                    if (key === 'MEMBERS' && currentOwner) {
                      setOwnerMembersLoading(true);
                      try { setOwnerMembers(await loadGymPasses(currentOwner.id)); }
                      catch(e) { console.warn('loadGymPasses:', e.message); }
                      finally { setOwnerMembersLoading(false); }
                    }
                  }}>
                    <Text style={[styles.tabBtnText, ownerTab===key && styles.tabBtnTextActive]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {ownerTab === 'DESK' && (
                <View>
                  <View style={{backgroundColor:'#F8F8F8',padding:25,borderRadius:15,borderWidth:1,borderColor:'#EEE',marginBottom:20}}>
                    <Text style={{fontSize:22,fontWeight:'bold',marginBottom:10,textAlign:'center'}}>Pass Verification</Text>
                    <Text style={{color:'#666',textAlign:'center',marginBottom:20}}>Tap the box and point your scanner at the customer device. Physical scanners auto-submit.</Text>
                    <TextInput
                      style={[styles.input,{fontSize:24,padding:20,textAlign:'center',borderWidth:2,borderColor:'#007AFF',backgroundColor:'#E5F1FF',height:80}]}
                      placeholder="Awaiting Scan..." value={scannerInput} onChangeText={setScannerInput} onSubmitEditing={handleDeskScan} autoCapitalize="characters" autoCorrect={false}
                    />
                    <TouchableOpacity style={[styles.primaryBtn,{marginTop:15,backgroundColor:'#34C759'}]} onPress={handleDeskScan}>
                      <Text style={styles.btnText}>Manual Verify</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
                    <Text style={styles.sectionLabel}>Today's Check-ins ({ownerScanLog.filter(e=>e.status==='GRANTED').length})</Text>
                    {ownerScanLog.length > 0 && (
                      <TouchableOpacity onPress={() => setOwnerScanLog([])}>
                        <Text style={{color:'#FF3B30',fontSize:13,fontWeight:'600'}}>Clear</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  {ownerScanLog.length === 0 ? (
                    <Text style={{color:'#999',fontStyle:'italic',textAlign:'center',marginBottom:20}}>No scans this session.</Text>
                  ) : ownerScanLog.map((entry, i) => {
                    const granted = entry.status === 'GRANTED';
                    const color = granted ? '#34C759' : '#FF3B30';
                    const icon = granted ? '🟢' : '🔴';
                    return (
                      <View key={i} style={[styles.itemCard,{paddingVertical:12,marginBottom:8,borderLeftWidth:4,borderLeftColor:color}]}>
                        <View style={styles.rowJustify}>
                          <Text style={{fontWeight:'700',fontSize:14}}>{icon} {entry.label}</Text>
                          <Text style={{color:'#999',fontSize:12}}>{entry.time}</Text>
                        </View>
                        <Text style={{color:'#666',fontSize:12,marginTop:3}}>{entry.note} • {entry.passId}</Text>
                      </View>
                    );
                  })}
                </View>
              )}

              {ownerTab === 'ANALYTICS' && (
                <View>
                  {!planAllows(currentOwner,'analytics') && (
                    <TouchableOpacity style={styles.proGate} onPress={() => handleUpgradePlan('basic')}>
                      <Text style={styles.proGateTitle}>📊 Unlock Analytics</Text>
                      <Text style={styles.proGateSub}>Equipment breakdowns, member reviews, revenue tracking, pass performance. Basic and Pro plans only.</Text>
                      <Text style={styles.proGateAction}>Upgrade to Basic — $49/mo →</Text>
                    </TouchableOpacity>
                  )}
                  {planAllows(currentOwner,'analytics') && (<>
                    <Text style={styles.sectionLabel}>💰 Revenue Overview</Text>
                    <View style={styles.revenueCard}>
                      <View style={[styles.revenueRow, {marginBottom:14}]}>
                        <View style={styles.revenueStatBlock}>
                          <Text style={styles.revenueAmount}>${(currentOwner?.totalPassRevenue||0).toFixed(2)}</Text>
                          <Text style={styles.revenueLabel}>Total Earned</Text>
                        </View>
                        <View style={[styles.revenueStatBlock, {borderLeftWidth:1, borderLeftColor:'#EEE'}]}>
                          <Text style={[styles.revenueAmount, {color:'#FF3B30'}]}>${(currentOwner?.platformFeesPaid||0).toFixed(2)}</Text>
                          <Text style={styles.revenueLabel}>Platform Fees (12%)</Text>
                        </View>
                      </View>
                      <View style={styles.revenueRow}>
                        <View style={styles.revenueStatBlock}>
                          <Text style={[styles.revenueAmount, {color:'#34C759'}]}>{currentOwner?.monthlyPassSales||0}</Text>
                          <Text style={styles.revenueLabel}>Passes Sold</Text>
                        </View>
                        <View style={[styles.revenueStatBlock, {borderLeftWidth:1, borderLeftColor:'#EEE'}]}>
                          <Text style={[styles.revenueAmount, {color:'#5856D6'}]}>{currentOwner?.referralCount||0}</Text>
                          <Text style={styles.revenueLabel}>Referrals</Text>
                        </View>
                      </View>
                    </View>

                    <Text style={styles.sectionLabel}>🎁 Invite Another Gym</Text>
                    <TouchableOpacity style={[styles.infoBox,{backgroundColor:'#1C1C1E',borderWidth:0}]} onPress={shareOwnerReferralCode}>
                      <View style={styles.rowJustify}>
                        <View>
                          <Text style={{fontSize:15, fontWeight:'800', color:'#FFF'}}>Your code: {currentOwner?.referralCode}</Text>
                          <Text style={{fontSize:12, color:'#CCC', marginTop:3}}>{currentOwner?.referralCount||0} gyms joined via your code</Text>
                        </View>
                        <Text style={{fontSize:14, fontWeight:'700', color:'#FFF'}}>Share →</Text>
                      </View>
                    </TouchableOpacity>

                    <Text style={styles.sectionLabel}>⭐ Subscription & Placement</Text>
                    <TouchableOpacity style={[styles.infoBox, {borderLeftWidth:4, borderLeftColor: planTier.color}]} onPress={() => setShowSubscriptionModal(true)}>
                      <View style={styles.rowJustify}>
                        <Text style={{fontSize:17, fontWeight:'800', color: planTier.color}}>{planTier.emoji} {planTier.name} Plan</Text>
                        <Text style={{color:'#007AFF', fontWeight:'700'}}>${planTier.price}/mo</Text>
                      </View>
                      <Text style={{color:'#888', fontSize:12, marginTop:6}}>Tap to upgrade, downgrade, or manage billing →</Text>
                    </TouchableOpacity>
                    <View style={[styles.infoBox, {flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom:14}]}>
                      <View style={{flex:1, marginRight:12}}>
                        <Text style={{fontWeight:'700', fontSize:15}}>⭐ Featured Placement</Text>
                        <Text style={{color:'#888', fontSize:12, marginTop:3}}>{planAllows(currentOwner,'featured') ? 'Appear at the top of member searches.' : 'Pro plan required.'}</Text>
                      </View>
                      <Switch value={!!currentOwner?.featured} onValueChange={handleToggleFeatured} trackColor={{false:'#CCC', true:'#FF9500'}} thumbColor='#FFF' disabled={!planAllows(currentOwner,'featured')}/>
                    </View>

                    <Text style={styles.sectionLabel}>Facility Overview</Text>
                    <View style={[styles.row,{flexWrap:'wrap',gap:12,marginBottom:15}]}>
                      {[
                        { label:'Equipment', value: analytics.equipment?.length || 0, color:'#007AFF', icon:'🏋️' },
                        { label:'Pass Tiers', value: analytics.passes?.length || 0, color:'#34C759', icon:'🎟️' },
                        { label:'Trainers', value: analytics.trainers?.length || 0, color:'#FF9500', icon:'👤' },
                        { label:'Classes', value: analytics.classes?.length || 0, color:'#5856D6', icon:'📋' },
                        { label:'Search Views', value: currentOwner?.matchImpressions || 0, color:'#AF52DE', icon:'✨' },
                      ].map(stat => (
                        <View key={stat.label} style={{flex:1,minWidth:130,backgroundColor:stat.color+'15',padding:16,borderRadius:14,borderWidth:1,borderColor:stat.color+'30',alignItems:'center'}}>
                          <Text style={{fontSize:28}}>{stat.icon}</Text>
                          <Text style={{fontSize:30,fontWeight:'900',color:stat.color,marginTop:4}}>{stat.value}</Text>
                          <Text style={{color:'#666',fontSize:12,fontWeight:'600',marginTop:2}}>{stat.label}</Text>
                        </View>
                      ))}
                    </View>
                  </>)}
                </View>
              )}

              {ownerTab === 'TRAINERS' && (
                <View>
                  <Text style={styles.sectionLabel}>Manage Trainer Roster</Text>
                  <View style={styles.infoBox}>
                    <TextInput style={styles.input} placeholder="Trainer Name" value={newTrainer.name} onChangeText={t => setNewTrainer({...newTrainer,name:t})}/>
                    <TextInput style={styles.input} placeholder="Hourly Fee ($)" value={newTrainer.fee} keyboardType="numeric" onChangeText={t => setNewTrainer({...newTrainer,fee:t})}/>
                    <TextInput style={[styles.input,{height:80,textAlignVertical:'top'}]} placeholder="Bio & Specialties" multiline value={newTrainer.bio} onChangeText={t => setNewTrainer({...newTrainer,bio:t})}/>
                    <TouchableOpacity style={[styles.primaryBtn,{backgroundColor:'#34C759'}]} onPress={handleAddTrainer}><Text style={styles.btnText}>+ Add Trainer</Text></TouchableOpacity>
                  </View>
                  {(infoForm.trainers||[]).map(t => (
                    <View key={t.id} style={[styles.itemCard,styles.rowJustify]}>
                      <View style={{flex:1}}>
                        <Text style={styles.itemTitle}>{t.name}</Text>
                        <Text style={styles.itemSub}>${t.fee}/hr • {t.bio}</Text>
                      </View>
                      <TouchableOpacity onPress={() => handleRemoveTrainer(t.id)}><Text style={{color:'#FF3B30',paddingLeft:10}}>Remove</Text></TouchableOpacity>
                    </View>
                  ))}
                  {(infoForm.trainers||[]).length === 0 && <Text style={{color:'#999',fontStyle:'italic',textAlign:'center',marginTop:10}}>No trainers added yet.</Text>}

                  {/* Booking Requests */}
                  {(currentOwner?.bookingRequests||[]).length > 0 && (<>
                    <Text style={[styles.sectionLabel,{marginTop:20}]}>📅 Booking Requests ({currentOwner.bookingRequests.length})</Text>
                    {currentOwner.bookingRequests.map(req => {
                      const isPending = req.status === 'PENDING';
                      return (
                        <View key={req.id} style={[styles.itemCard,{borderLeftWidth:4,borderLeftColor:isPending?'#FF9500':'#34C759'}]}>
                          <View style={styles.rowJustify}>
                            <Text style={{fontWeight:'700',fontSize:15}}>@{req.username}</Text>
                            <View style={{flexDirection:'row',gap:8}}>
                              {isPending && (
                                <>
                                  <TouchableOpacity style={{backgroundColor:'#34C759',paddingHorizontal:10,paddingVertical:5,borderRadius:8}} onPress={async () => {
                                    const updated = {...currentOwner, bookingRequests: currentOwner.bookingRequests.map(r => r.id===req.id ? {...r,status:'CONFIRMED'} : r)};
                                    await persistOwner(updated);
                                    notifyUserPush(req.userId, 'Booking confirmed! 🎉', `${req.trainerName} confirmed your session at ${currentOwner.gymName}.`);
                                  }}>
                                    <Text style={{color:'#FFF',fontWeight:'700',fontSize:12}}>Confirm</Text>
                                  </TouchableOpacity>
                                  <TouchableOpacity style={{backgroundColor:'#FF3B30',paddingHorizontal:10,paddingVertical:5,borderRadius:8}} onPress={async () => {
                                    const updated = {...currentOwner, bookingRequests: currentOwner.bookingRequests.filter(r => r.id!==req.id)};
                                    await persistOwner(updated);
                                    notifyUserPush(req.userId, 'Booking update', `${req.trainerName} at ${currentOwner.gymName} couldn't confirm your requested session.`);
                                  }}>
                                    <Text style={{color:'#FFF',fontWeight:'700',fontSize:12}}>Decline</Text>
                                  </TouchableOpacity>
                                </>
                              )}
                              {!isPending && <Text style={{color:'#34C759',fontWeight:'700',fontSize:12}}>✓ Confirmed</Text>}
                            </View>
                          </View>
                          <Text style={{color:'#007AFF',fontSize:12,marginTop:2,fontWeight:'600'}}>{req.trainerName}</Text>
                          <Text style={{color:'#555',fontSize:13,marginTop:6,lineHeight:19}}>{req.message}</Text>
                          <Text style={{color:'#999',fontSize:11,marginTop:6}}>{new Date(req.requestedAt).toLocaleString()}</Text>
                        </View>
                      );
                    })}
                  </>)}
                </View>
              )}

              {ownerTab === 'MEMBERS' && (
                <View>
                  <View style={styles.rowJustify}>
                    <Text style={styles.sectionLabel}>Pass Holders</Text>
                    <TouchableOpacity onPress={async () => {
                      setOwnerMembersLoading(true);
                      try { setOwnerMembers(await loadGymPasses(currentOwner.id)); }
                      catch(e) { console.warn(e.message); }
                      finally { setOwnerMembersLoading(false); }
                    }}>
                      <Text style={{color:'#007AFF',fontWeight:'600',fontSize:13}}>↻ Refresh</Text>
                    </TouchableOpacity>
                  </View>
                  {ownerMembersLoading ? (
                    <ActivityIndicator size="large" color="#007AFF" style={{marginVertical:30}}/>
                  ) : ownerMembers.length === 0 ? (
                    <View style={{alignItems:'center',paddingVertical:40}}>
                      <Text style={{fontSize:40,marginBottom:12}}>🎟️</Text>
                      <Text style={{fontSize:16,fontWeight:'700',color:'#333',marginBottom:6}}>No passes sold yet</Text>
                      <Text style={{color:'#888',textAlign:'center',fontSize:13}}>Pass holders will appear here once members purchase access.</Text>
                    </View>
                  ) : (<>
                    <View style={{flexDirection:'row',gap:12,marginBottom:16}}>
                      {[
                        {label:'Total Sold', value: ownerMembers.length, color:'#007AFF'},
                        {label:'Active', value: ownerMembers.filter(p => !p.expiresAt || new Date(p.expiresAt) > new Date()).length, color:'#34C759'},
                        {label:'Expired', value: ownerMembers.filter(p => p.expiresAt && new Date(p.expiresAt) <= new Date()).length, color:'#FF3B30'},
                      ].map(stat => (
                        <View key={stat.label} style={{flex:1,backgroundColor:stat.color+'15',padding:14,borderRadius:12,alignItems:'center',borderWidth:1,borderColor:stat.color+'30'}}>
                          <Text style={{fontSize:24,fontWeight:'900',color:stat.color}}>{stat.value}</Text>
                          <Text style={{color:'#666',fontSize:11,fontWeight:'600',marginTop:2}}>{stat.label}</Text>
                        </View>
                      ))}
                    </View>
                    {ownerMembers.map(pass => {
                      const expired = pass.expiresAt && new Date(pass.expiresAt) <= new Date();
                      const hasPunch = pass.remainingPunches !== null && pass.remainingPunches !== undefined;
                      return (
                        <View key={pass.id} style={[styles.itemCard,{borderLeftWidth:4,borderLeftColor:expired?'#FF3B30':'#34C759',marginBottom:10}]}>
                          <View style={styles.rowJustify}>
                            <Text style={{fontWeight:'700',fontSize:14}}>{pass.label}</Text>
                            <Text style={{color:expired?'#FF3B30':'#34C759',fontWeight:'700',fontSize:12}}>{expired?'Expired':'Active'}</Text>
                          </View>
                          <Text style={{color:'#666',fontSize:12,marginTop:2}}>User ID: {pass.userId}</Text>
                          {hasPunch && <Text style={{color:'#007AFF',fontSize:12,marginTop:2}}>{pass.remainingPunches}/{pass.totalPunches} scans remaining</Text>}
                          <View style={styles.rowJustify}>
                            <Text style={{color:'#999',fontSize:11,marginTop:4}}>Purchased: {new Date(pass.purchasedAt).toLocaleDateString()}</Text>
                            {pass.expiresAt && <Text style={{color:'#999',fontSize:11,marginTop:4}}>Expires: {new Date(pass.expiresAt).toLocaleDateString()}</Text>}
                          </View>
                          <Text style={{color:'#34C759',fontWeight:'700',fontSize:13,marginTop:4}}>${Number(pass.gymReceives||0).toFixed(2)} earned</Text>
                        </View>
                      );
                    })}
                  </>)}
                </View>
              )}

              {ownerTab === 'EQUIP' && (
                <View>
                  <TouchableOpacity style={[styles.primaryBtn,{marginBottom:10,backgroundColor:'#5856D6'}]} onPress={() => {
                    setEquipSearchQuery(''); setEquipSearchBrandFilter('All');
                    setEquipSearchResults([]); setEquipSearchMode('LOCAL'); setEquipSearchError('');
                    navigateTo('OWNER_EQUIP_SEARCH');
                  }}>
                    <Text style={styles.btnText}>🔍 Search & Add Equipment</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.primaryBtn,{marginBottom:10,backgroundColor:'#007AFF'}]} onPress={() => navigateTo('OWNER_EQUIP_REPO')}>
                    <Text style={styles.btnText}>🌐 Browse Global Brand Repository</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.primaryBtn,{marginBottom:20,backgroundColor:'#34C759'}]} onPress={() => { setEditEquipData({}); navigateTo('OWNER_EQUIP_ADD'); }}>
                    <Text style={styles.btnText}>+ Add Custom Equipment</Text>
                  </TouchableOpacity>

                  <Text style={styles.sectionLabel}>Current Inventory ({activeEquipmentList.length})</Text>
                  {activeEquipmentList.length > 0 ? activeEquipmentList.map(eq => (
                    <TouchableOpacity key={eq.id} style={styles.itemCard} onPress={() => { setEditEquipData(eq); navigateTo('OWNER_EQUIP_EDIT'); }}>
                      <View style={styles.rowJustify}>
                        <Text style={styles.itemTitle}>{eq.name}</Text>
                        <View style={{flexDirection:'row',alignItems:'center',gap:8}}>
                          <Text style={styles.categoryBadge}>{eq.category}</Text>
                          <Text style={styles.backLink}>Edit ✎</Text>
                        </View>
                      </View>
                      <Text style={{color:'#666',marginTop:4,fontSize:13}}>Target: {eq.targetArea}</Text>
                    </TouchableOpacity>
                  )) : <Text style={{color:'#999',fontStyle:'italic',marginBottom:20}}>No equipment yet. Add from the options above.</Text>}
                </View>
              )}

              {ownerTab === 'INFO' && (
                <View>
                  <Text style={styles.sectionLabel}>Public Gym Information</Text>
                  <TextInput style={styles.input} value={infoForm.gymName} onChangeText={t => setInfoForm(p=>({...p,gymName:t}))} placeholder="Public Gym Name"/>
                  <TextInput style={styles.input} value={infoForm.location} onChangeText={t => setInfoForm(p=>({...p,location:t}))} placeholder="Full Address"/>
                  <TextInput style={styles.input} value={infoForm.phone} onChangeText={t => setInfoForm(p=>({...p,phone:t}))} placeholder="Contact Phone" keyboardType="phone-pad"/>
                  <TextInput style={styles.input} value={infoForm.pricing} onChangeText={t => setInfoForm(p=>({...p,pricing:t}))} placeholder="Display Pricing"/>
                  <TextInput style={styles.input} value={String(infoForm.monthlyPrice||'')} onChangeText={t => setInfoForm(p=>({...p,monthlyPrice:t}))} placeholder="Numeric Monthly Price" keyboardType="numeric"/>

                  <Text style={styles.sectionLabel}>⏰ Hours of Operation</Text>
                  <TextInput style={styles.input} value={infoForm.hoursDisplay} onChangeText={t => setInfoForm(p=>({...p,hoursDisplay:t}))} placeholder="e.g. Mon-Fri 5AM-10PM"/>
                  <View style={styles.row}>
                    <TextInput style={[styles.input,{flex:1,marginRight:10}]} value={String(infoForm.openHour||'')} onChangeText={t => setInfoForm(p=>({...p,openHour:parseInt(t)||0}))} placeholder="Open Hour (0-23)" keyboardType="numeric"/>
                    <TextInput style={[styles.input,{flex:1}]} value={String(infoForm.closeHour||'')} onChangeText={t => setInfoForm(p=>({...p,closeHour:parseInt(t)||0}))} placeholder="Close Hour (0-23)" keyboardType="numeric"/>
                  </View>

                  <Text style={styles.sectionLabel}>🎟️ Pass Tier Builder</Text>
                  <View style={styles.infoBox}>
                    {(infoForm.passes||[]).map(pass => (
                      <View key={pass.id} style={[styles.rowJustify,{marginBottom:10,paddingBottom:10,borderBottomWidth:1,borderBottomColor:'#EEE'}]}>
                        <View>
                          <Text style={{fontWeight:'bold',fontSize:16}}>{pass.label}</Text>
                          <Text style={{color:'#555',fontSize:12}}>{pass.type==='TIME'?`${pass.value} Days Valid`:`${pass.value} Scans`}</Text>
                        </View>
                        <View style={{alignItems:'flex-end'}}>
                          <Text style={{color:'#34C759',fontWeight:'bold'}}>${pass.price.toFixed(2)}</Text>
                          <TouchableOpacity onPress={() => handleRemovePassFromRepository(pass.id)}><Text style={{color:'#FF3B30',fontSize:12,marginTop:4}}>Remove</Text></TouchableOpacity>
                        </View>
                      </View>
                    ))}
                    <View style={{marginTop:10,borderTopWidth:1,borderTopColor:'#DDD',paddingTop:15}}>
                      <Text style={{fontSize:12,color:'#888',marginBottom:8}}>Presets:</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom:10}}>
                        {PRESET_PASSES.map(preset => (
                          <TouchableOpacity key={preset.label} style={[styles.filterChip,newPassLabel===preset.label&&styles.filterChipActive]} onPress={() => { setNewPassLabel(preset.label); setNewPassPrice(preset.price); setNewPassType(preset.type); setNewPassValue(preset.value); }}>
                            <Text style={[styles.filterChipText,newPassLabel===preset.label&&styles.filterChipTextActive]}>{preset.label}</Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                      <TextInput style={styles.input} placeholder="Custom Pass Name" value={newPassLabel} onChangeText={setNewPassLabel}/>
                      <TextInput style={styles.input} placeholder="Price ($)" value={newPassPrice} onChangeText={setNewPassPrice} keyboardType="numeric"/>
                      <View style={[styles.row,{marginBottom:10}]}>
                        <TouchableOpacity style={[styles.tabBtn,newPassType==='TIME'?styles.tabBtnActive:{backgroundColor:'#E5E5EA'}]} onPress={() => setNewPassType('TIME')}>
                          <Text style={[styles.tabBtnText,newPassType==='TIME'&&styles.tabBtnTextActive]}>⏳ Time-Based</Text>
                        </TouchableOpacity>
                        <View style={{width:10}}/>
                        <TouchableOpacity style={[styles.tabBtn,newPassType==='PUNCH'?styles.tabBtnActive:{backgroundColor:'#E5E5EA'}]} onPress={() => setNewPassType('PUNCH')}>
                          <Text style={[styles.tabBtnText,newPassType==='PUNCH'&&styles.tabBtnTextActive]}>🎫 Punch Card</Text>
                        </TouchableOpacity>
                      </View>
                      <TextInput style={styles.input} placeholder={newPassType==='TIME'?"Days Valid (e.g. 7)":"Scans Allowed (e.g. 10)"} value={newPassValue} onChangeText={setNewPassValue} keyboardType="numeric"/>
                      <TouchableOpacity style={[styles.primaryBtn,{backgroundColor:'#5856D6'}]} onPress={handleAddPassToRepository}><Text style={styles.btnText}>+ Add to Menu</Text></TouchableOpacity>
                    </View>
                  </View>

                  <Text style={styles.sectionLabel}>🔥 Promotions</Text>
                  <Text style={{color:'#888',fontSize:12,marginBottom:10,marginTop:-6}}>Time-boxed offers shown to members browsing your gym — a fresh reason to pick you over a competitor.</Text>
                  <View style={styles.infoBox}>
                    {(infoForm.promotions||[]).map(promo => {
                      const active = getActivePromotion({ promotions: [promo] });
                      return (
                        <View key={promo.id} style={{marginBottom:10,paddingBottom:10,borderBottomWidth:1,borderBottomColor:'#EEE'}}>
                          <View style={styles.rowJustify}>
                            <View style={{flex:1,marginRight:10}}>
                              <Text style={{fontWeight:'bold',fontSize:15}}>{promo.title}</Text>
                              {!!promo.detail && <Text style={{color:'#555',fontSize:12,marginTop:2}}>{promo.detail}</Text>}
                              <Text style={{color: active?'#34C759':'#999', fontSize:11, marginTop:4, fontWeight:'700'}}>
                                {active ? `Live until ${new Date(promo.endDate).toLocaleDateString()}` : 'Expired'}
                              </Text>
                            </View>
                            <TouchableOpacity onPress={() => handleRemovePromotion(promo.id)}><Text style={{color:'#FF3B30',fontSize:12}}>Remove</Text></TouchableOpacity>
                          </View>
                        </View>
                      );
                    })}
                    {(infoForm.promotions||[]).length === 0 && <Text style={{color:'#999',fontStyle:'italic',marginBottom:10}}>No active promotions.</Text>}
                    <TextInput style={styles.input} placeholder='Title, e.g. "20% off day passes this week"' value={newPromoTitle} onChangeText={setNewPromoTitle}/>
                    <TextInput style={styles.input} placeholder="Details (optional)" value={newPromoDetail} onChangeText={setNewPromoDetail}/>
                    <TextInput style={styles.input} placeholder="Runs for how many days?" value={newPromoDays} onChangeText={setNewPromoDays} keyboardType="numeric"/>
                    <TouchableOpacity style={[styles.primaryBtn,{backgroundColor:'#FF9500'}]} onPress={handleAddPromotion}><Text style={styles.btnText}>+ Launch Promotion</Text></TouchableOpacity>
                  </View>

                  <Text style={styles.sectionLabel}>Classes Offered</Text>
                  <View style={{flexDirection:'row',flexWrap:'wrap',marginBottom:15}}>
                    {[...new Set([...CLASS_TYPES,...(infoForm.classes||[])])].map(cls => {
                      const active = infoForm.classes?.includes(cls);
                      return (
                        <TouchableOpacity key={cls} onPress={() => { const c=infoForm.classes||[]; setInfoForm(p=>({...p,classes:active?c.filter(x=>x!==cls):[...c,cls]})); }} style={[styles.filterChip,{marginBottom:10},active&&styles.filterChipActive]}>
                          <Text style={[styles.filterChipText,active&&styles.filterChipTextActive]}>{cls}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <View style={styles.row}>
                    <TextInput style={[styles.input,{flex:1,marginRight:10,marginBottom:0}]} placeholder="Add Custom Class..." value={customClassInput} onChangeText={setCustomClassInput}/>
                    <TouchableOpacity style={[styles.primaryBtn,{backgroundColor:'#5856D6',paddingHorizontal:20}]} onPress={handleAddCustomClass}><Text style={styles.btnText}>Add</Text></TouchableOpacity>
                  </View>

                  <TextInput style={[styles.input,{height:100,textAlignVertical:'top',marginTop:15}]} value={infoForm.description} onChangeText={t => setInfoForm(p=>({...p,description:t}))} placeholder="Tell customers about your facility..." multiline/>
                  <TouchableOpacity style={[styles.primaryBtn,{marginTop:10}]} onPress={saveGymProfile} disabled={isSavingGeo}>
                    {isSavingGeo ? <ActivityIndicator color="#FFF"/> : <Text style={styles.btnText}>Save to Database</Text>}
                  </TouchableOpacity>
                </View>
              )}
              <View style={{height:40}}/>
            </ScrollView>
          </SafeAreaView>
        );
      }

      case 'OWNER_EQUIP_REPO': {
        const uniqueBrands = [...new Set(GLOBAL_EQUIPMENT_DATABASE.map(i => i.brand))];
        const brandEquipment = selectedGlobalBrand ? GLOBAL_EQUIPMENT_DATABASE.filter(i => i.brand===selectedGlobalBrand) : [];
        return (
          <SafeAreaView style={styles.container}>
            <View style={{flex:1}}>
              <View style={[styles.padding,{paddingBottom:10}]}>
                {selectedGlobalBrand ? (
                  <TouchableOpacity onPress={() => setSelectedGlobalBrand(null)}><Text style={styles.backLink}>← All Brands</Text></TouchableOpacity>
                ) : (
                  <TouchableOpacity onPress={() => navigateTo('OWNER_DASHBOARD')}><Text style={styles.backLink}>← Back to Dashboard</Text></TouchableOpacity>
                )}
                <Text style={styles.header}>{selectedGlobalBrand||'Global Repository'}</Text>
                {!selectedGlobalBrand && <Text style={{color:'#666',marginBottom:15}}>Select a brand to browse and add equipment to your inventory.</Text>}
              </View>
              {!selectedGlobalBrand ? (
                <FlatList
                  contentContainerStyle={{paddingHorizontal:25, paddingBottom:30}}
                  data={uniqueBrands}
                  keyExtractor={i=>i}
                  renderItem={({item}) => {
                    const siteInfo = BRAND_WEBSITES[item];
                    const count = GLOBAL_EQUIPMENT_DATABASE.filter(e=>e.brand===item).length;
                    return (
                      <TouchableOpacity style={[styles.itemCard, {paddingVertical:20}]} onPress={() => setSelectedGlobalBrand(item)}>
                        <View style={styles.rowJustify}>
                          <Text style={[styles.itemTitle, {fontSize:20}]}>{item}</Text>
                          <View style={{backgroundColor:'#E5F1FF', paddingHorizontal:10, paddingVertical:4, borderRadius:8}}>
                            <Text style={{color:'#007AFF', fontWeight:'700', fontSize:13}}>{count} items</Text>
                          </View>
                        </View>
                        <View style={[styles.rowJustify, {marginTop:12, alignItems:'center'}]}>
                          <Text style={{color:'#34C759', fontWeight:'700', fontSize:13}}>Browse in app →</Text>
                          {siteInfo && (
                            <TouchableOpacity style={[styles.brandWebsiteChip, {backgroundColor:'#E8F5E9', borderColor:'#A5D6A7'}]} onPress={(e) => { e.stopPropagation?.(); Linking.openURL(siteInfo.url); }} hitSlop={{top:8, bottom:8, left:8, right:8}}>
                              <Text style={[styles.brandWebsiteChipText, {color:'#2E7D32'}]}>🌐 Website</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      </TouchableOpacity>
                    );
                  }}
                />
              ) : (
                <FlatList
                  contentContainerStyle={{paddingHorizontal:25, paddingBottom:30}}
                  data={brandEquipment}
                  keyExtractor={i=>i.id}
                  showsVerticalScrollIndicator={false}
                  renderItem={({item}) => (
                    <TouchableOpacity
                      style={styles.itemCard}
                      onPress={() => {
                        Alert.alert('Add Equipment', `Add ${item.name} to your inventory?`, [
                          { text:'Cancel', style:'cancel' },
                          { text:'Add to Inventory', onPress: async () => {
                            const newEq = {...item, id: uniqueId('e_'), mfgDate:'', serviceDate:''};
                            const updated = {...currentOwner, equipment:[newEq,...(currentOwner.equipment||[])]};
                            await persistOwner(updated);
                            Alert.alert('Added!', `${item.name} has been added to your inventory.`);
                            setSelectedGlobalBrand(null); navigateTo('OWNER_DASHBOARD');
                          }},
                        ]);
                      }}
                    >
                      {item.image && (
                        <Image source={{uri:item.image}} style={{width:'100%', height:150, borderRadius:10, marginBottom:10, backgroundColor:'#EEE'}} resizeMode="cover"/>
                      )}
                      <View style={styles.rowJustify}>
                        <Text style={styles.itemTitle}>{item.name}</Text>
                        <Text style={styles.categoryBadge}>{item.category}</Text>
                      </View>
                      <Text style={{marginTop:6, color:'#555', fontWeight:'600', fontSize:13}}>Target: {item.targetArea}</Text>
                      <Text style={{marginTop:4, color:'#777', fontSize:12}} numberOfLines={2}>{item.instructions}</Text>
                    </TouchableOpacity>
                  )}
                />
              )}
            </View>
          </SafeAreaView>
        );
      }

      case 'OWNER_EQUIP_SEARCH': {
        const allBrands = [...new Set(GLOBAL_EQUIPMENT_DATABASE.map(i => i.brand))];
        const localPreview = equipSearchQuery.trim() || equipSearchBrandFilter !== 'All'
          ? runLocalEquipSearch(equipSearchQuery, equipSearchBrandFilter)
          : [];
        return (
          <SafeAreaView style={styles.container}>
            <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':'height'} style={{flex:1}}>
              <View style={{flex:1}}>
                <View style={[styles.padding, {paddingBottom:12}]}>
                  <TouchableOpacity onPress={() => navigateTo('OWNER_EQUIP_REPO')}>
                    <Text style={styles.backLink}>← Back to Repository</Text>
                  </TouchableOpacity>
                  <Text style={styles.header}>Equipment Search</Text>
                  <Text style={{color:'#666', marginBottom:12, fontSize:14}}>Search our database or let AI find equipment from any brand.</Text>

                  <View style={[styles.tabRow, {marginBottom:12}]}>
                    <TouchableOpacity style={[styles.tabBtn, equipSearchMode==='LOCAL' && styles.tabBtnActive]} onPress={() => { setEquipSearchMode('LOCAL'); setEquipSearchResults([]); setEquipSearchError(''); }}>
                      <Text style={[styles.tabBtnText, equipSearchMode==='LOCAL' && styles.tabBtnTextActive]}>📦 Database ({GLOBAL_EQUIPMENT_DATABASE.length})</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.tabBtn, equipSearchMode==='AI' && styles.tabBtnActive]} onPress={() => { setEquipSearchMode('AI'); setEquipSearchResults([]); setEquipSearchError(''); }}>
                      <Text style={[styles.tabBtnText, equipSearchMode==='AI' && styles.tabBtnTextActive]}>✨ AI Web Search</Text>
                    </TouchableOpacity>
                  </View>

                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom:12}}>
                    {['All', ...allBrands].map(b => (
                      <TouchableOpacity key={b} style={[styles.filterChip, equipSearchBrandFilter===b && styles.filterChipActive, {marginRight:8}]} onPress={() => { setEquipSearchBrandFilter(b); if (equipSearchMode==='LOCAL') setEquipSearchResults(runLocalEquipSearch(equipSearchQuery, b)); }}>
                        <Text style={[styles.filterChipText, equipSearchBrandFilter===b && styles.filterChipTextActive]}>{b}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>

                  <View style={styles.equipSearchBar}>
                    <TextInput
                      style={styles.equipSearchInput}
                      placeholder={equipSearchMode==='AI' ? 'e.g. cable fly machine' : 'Search name, muscle, category...'}
                      placeholderTextColor="#999"
                      value={equipSearchQuery}
                      onChangeText={t => { setEquipSearchQuery(t); if (equipSearchMode==='LOCAL') setEquipSearchResults(runLocalEquipSearch(t, equipSearchBrandFilter)); }}
                      onSubmitEditing={handleEquipSearch}
                      returnKeyType="search"
                      autoCorrect={false}
                    />
                    <TouchableOpacity style={[styles.equipSearchBtn, isEquipSearching && {opacity:0.6}]} onPress={handleEquipSearch} disabled={isEquipSearching}>
                      {isEquipSearching ? <ActivityIndicator size="small" color="#FFF"/> : <Text style={{color:'#FFF', fontWeight:'800', fontSize:16}}>→</Text>}
                    </TouchableOpacity>
                  </View>

                  {equipSearchMode==='AI' && !apiKey && (
                    <TouchableOpacity style={styles.aiKeyNudge} onPress={() => setShowApiKeyModal(true)}>
                      <Text style={styles.aiKeyNudgeText}>⚡ Add API key to enable AI web search →</Text>
                    </TouchableOpacity>
                  )}

                  {equipSearchError ? (
                    <View style={{backgroundColor:'#FFEBEE', padding:10, borderRadius:8, marginTop:8}}>
                      <Text style={{color:'#C62828', fontSize:13}}>{equipSearchError}</Text>
                    </View>
                  ) : null}
                </View>

                <FlatList
                  contentContainerStyle={{paddingHorizontal:25, paddingBottom:40}}
                  data={equipSearchMode==='AI' ? equipSearchResults : (equipSearchResults.length > 0 ? equipSearchResults : localPreview)}
                  keyExtractor={(item, i) => item.id || `search_${i}`}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  ListEmptyComponent={() => (!isEquipSearching && !equipSearchError ? (
                    <View style={{alignItems:'center', paddingTop:40}}>
                      <Text style={{fontSize:40, marginBottom:12}}>🔍</Text>
                      <Text style={{fontSize:16, fontWeight:'700', color:'#333', marginBottom:6}}>
                        {equipSearchMode==='AI' ? 'Search Any Equipment' : 'Start Typing to Filter'}
                      </Text>
                      <Text style={{color:'#888', textAlign:'center', fontSize:14, lineHeight:20}}>
                        {equipSearchMode==='AI' ? 'Claude will find equipment from any brand on the web.' : `Browse ${GLOBAL_EQUIPMENT_DATABASE.length} pieces across ${allBrands.length} brands.`}
                      </Text>
                    </View>
                  ) : null)}
                  renderItem={({item}) => (
                    <View style={styles.equipSearchCard}>
                      {item.image ? <Image source={{uri: item.image}} style={{width:'100%', height:130, borderRadius:10, marginBottom:10, backgroundColor:'#EEE'}} resizeMode="cover"/> : null}
                      <View style={[styles.rowJustify, {marginBottom:6}]}>
                        <Text style={[styles.itemTitle, {flex:1, marginRight:8}]}>{item.name}</Text>
                        <Text style={styles.categoryBadge}>{item.category}</Text>
                      </View>
                      <View style={{flexDirection:'row', flexWrap:'wrap', gap:6, marginBottom:8}}>
                        {item.brand && (
                          <View style={{backgroundColor:'#E3F2FD', paddingHorizontal:8, paddingVertical:3, borderRadius:6}}>
                            <Text style={{color:'#1565C0', fontSize:11, fontWeight:'700'}}>{item.brand}</Text>
                          </View>
                        )}
                        {item.targetArea && (
                          <View style={{backgroundColor:'#E8F5E9', paddingHorizontal:8, paddingVertical:3, borderRadius:6}}>
                            <Text style={{color:'#2E7D32', fontSize:11, fontWeight:'600'}} numberOfLines={1}>🎯 {item.targetArea}</Text>
                          </View>
                        )}
                      </View>
                      {item.instructions ? <Text style={{color:'#555', fontSize:12, lineHeight:17, marginBottom:10}} numberOfLines={2}>{item.instructions}</Text> : null}
                      <View style={[styles.row, {gap:8}]}>
                        <TouchableOpacity style={[styles.primaryBtn, {flex:1, padding:12, backgroundColor:'#34C759'}]} onPress={() => addSearchResultToInventory(item)}>
                          <Text style={[styles.btnText, {fontSize:14}]}>+ Add to Inventory</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.primaryBtn, {flex:1, padding:12, backgroundColor:'#F0F0F0'}]} onPress={() => {
                          setEditEquipData({
                            name: item.name||'', brand: item.brand||'', category: item.category||'',
                            targetArea: item.targetArea||'', minWeight: item.minWeight||'',
                            maxWeight: item.maxWeight||'', instructions: item.instructions||'',
                            description: item.description||'', image: item.image||'',
                            muscleDiagram:'', videoThumbnail:'', mfgDate:'', serviceDate:'', reviews:[],
                          });
                          navigateTo('OWNER_EQUIP_ADD');
                        }}>
                          <Text style={[styles.btnText, {fontSize:14, color:'#333'}]}>Review & Edit</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                />
              </View>
            </KeyboardAvoidingView>
          </SafeAreaView>
        );
      }

      case 'OWNER_EQUIP_ADD':
      case 'OWNER_EQUIP_EDIT':
        return (
          <SafeAreaView style={styles.container}>
            <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':'height'} style={{flex:1}}>
              <ScrollView contentContainerStyle={styles.padding} keyboardShouldPersistTaps="handled">
                <TouchableOpacity onPress={() => { setEquipIdentifyResults(null); setEquipIdentifyError(''); navigateTo('OWNER_DASHBOARD'); }}>
                  <Text style={styles.backLink}>← Back</Text>
                </TouchableOpacity>
                <Text style={styles.header}>{editEquipData.id ? 'Edit' : 'Add'} Equipment</Text>

                <View style={styles.equipAiCard}>
                  <View style={styles.rowJustify}>
                    <View style={{flexDirection:'row', alignItems:'center', gap:8}}>
                      <Text style={styles.equipAiTitle}>🤖 AI Equipment Identifier</Text>
                      {planAllows(currentOwner,'aiFeatures') && apiKey && (
                        <View style={styles.aiBadge}><Text style={styles.aiBadgeText}>Claude ✓</Text></View>
                      )}
                    </View>
                    {planAllows(currentOwner,'aiFeatures') ? (
                      !apiKey && (
                        <TouchableOpacity onPress={() => setShowApiKeyModal(true)} style={styles.aiGearBtn}>
                          <Text style={{fontSize:14}}>⚙️</Text>
                        </TouchableOpacity>
                      )
                    ) : (
                      <View style={[styles.planBadge, {backgroundColor:'#FF9500', borderColor:'#FF9500'}]}>
                        <Text style={{color:'#FFF', fontWeight:'800', fontSize:10}}>PRO</Text>
                      </View>
                    )}
                  </View>

                  {!planAllows(currentOwner,'aiFeatures') ? (
                    <TouchableOpacity style={styles.proGate} onPress={() => handleUpgradePlan('pro')}>
                      <Text style={styles.proGateTitle}>⭐ Pro Feature</Text>
                      <Text style={styles.proGateSub}>Point your camera at any piece of equipment — Claude identifies it and auto-fills every field.</Text>
                      <Text style={styles.proGateAction}>Upgrade to Pro — $99/mo →</Text>
                    </TouchableOpacity>
                  ) : (
                    <>
                      <Text style={styles.equipAiSubtitle}>
                        {apiKey ? 'Take or upload a photo — Claude identifies the equipment and auto-fills all fields.' : 'Add your Anthropic API key to enable photo identification.'}
                      </Text>
                      <View style={[styles.row, {gap:10, marginTop:12}]}>
                        <TouchableOpacity style={[styles.equipAiBtn, !apiKey && styles.equipAiBtnDisabled, {flex:1}]} onPress={() => pickAndIdentifyEquipment('camera')} disabled={!apiKey || isIdentifyingEquip}>
                          <Text style={styles.equipAiBtnIcon}>📷</Text>
                          <Text style={styles.equipAiBtnText}>Take Photo</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.equipAiBtn, !apiKey && styles.equipAiBtnDisabled, {flex:1}]} onPress={() => pickAndIdentifyEquipment('library')} disabled={!apiKey || isIdentifyingEquip}>
                          <Text style={styles.equipAiBtnIcon}>🖼️</Text>
                          <Text style={styles.equipAiBtnText}>From Library</Text>
                        </TouchableOpacity>
                      </View>
                    </>
                  )}

                  {isIdentifyingEquip && (
                    <View style={styles.equipAiLoading}>
                      <ActivityIndicator size="small" color="#5856D6" style={{marginRight:10}}/>
                      <View>
                        <Text style={{color:'#5856D6', fontWeight:'700', fontSize:14}}>Identifying equipment...</Text>
                        <Text style={{color:'#888', fontSize:12, marginTop:2}}>Searching web for specs & workouts</Text>
                      </View>
                    </View>
                  )}

                  {equipIdentifyError ? (
                    <View style={styles.equipAiError}>
                      <Text style={{color:'#C62828', fontWeight:'600', fontSize:13}}>⚠️ Identification failed</Text>
                      <Text style={{color:'#C62828', fontSize:12, marginTop:4}}>{equipIdentifyError}</Text>
                    </View>
                  ) : null}
                </View>

                <Text style={[styles.sectionLabel, {marginTop:20}]}>
                  {equipIdentifyResults ? '📝 Review & Edit Details' : 'Equipment Details'}
                </Text>

                {editEquipData.image ? (
                  <View style={{marginBottom:15}}>
                    <Image source={{uri: editEquipData.image}} style={{width:'100%', height:200, borderRadius:12, backgroundColor:'#EEE'}} resizeMode="cover"/>
                    <TouchableOpacity style={{marginTop:8, alignSelf:'center', paddingHorizontal:16, paddingVertical:6, backgroundColor:'#F0F0F0', borderRadius:8}} onPress={() => pickEditMedia('image', false)}>
                      <Text style={{color:'#555', fontSize:13, fontWeight:'600'}}>Change Photo</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity style={styles.uploadBtn} onPress={() => pickEditMedia('image', false)}>
                    <Text style={{color:'#999', fontWeight:'bold'}}>📷 Upload Equipment Photo</Text>
                  </TouchableOpacity>
                )}

                <TextInput style={styles.input} value={editEquipData.name} onChangeText={t => setEditEquipData(p=>({...p, name:t}))} placeholder="Equipment Name"/>
                <TextInput style={styles.input} value={editEquipData.category} onChangeText={t => setEditEquipData(p=>({...p, category:t}))} placeholder="Category (Machine / Cable / Free Weight / Cardio)"/>
                <TextInput style={styles.input} value={editEquipData.targetArea} onChangeText={t => setEditEquipData(p=>({...p, targetArea:t}))} placeholder="Target Muscles"/>

                <Text style={styles.sectionLabel}>Weight Range (lbs)</Text>
                <View style={styles.row}>
                  <TextInput style={[styles.input,{flex:1,marginRight:10}]} value={editEquipData.minWeight} onChangeText={t => setEditEquipData(p=>({...p,minWeight:t}))} placeholder="Min" keyboardType="numeric"/>
                  <TextInput style={[styles.input,{flex:1}]} value={editEquipData.maxWeight} onChangeText={t => setEditEquipData(p=>({...p,maxWeight:t}))} placeholder="Max" keyboardType="numeric"/>
                </View>

                <Text style={styles.sectionLabel}>Maintenance Schedule</Text>
                <View style={styles.row}>
                  <TouchableOpacity style={[styles.input,{flex:1,marginRight:10}]} onPress={() => { setDatePickerField('mfgDate'); setShowDatePicker(true); }}>
                    <Text style={{color:editEquipData.mfgDate?'#000':'#999'}}>{editEquipData.mfgDate||'Mfg Date'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.input,{flex:1}]} onPress={() => { setDatePickerField('serviceDate'); setShowDatePicker(true); }}>
                    <Text style={{color:editEquipData.serviceDate?'#000':'#999'}}>{editEquipData.serviceDate||'Service Date'}</Text>
                  </TouchableOpacity>
                </View>

                <TextInput
                  style={[styles.input,{height:110,textAlignVertical:'top'}]}
                  value={editEquipData.instructions}
                  onChangeText={t => setEditEquipData(p=>({...p,instructions:t}))}
                  placeholder="Usage Instructions"
                  multiline
                />

                <TouchableOpacity style={[styles.primaryBtn,{marginBottom:15, backgroundColor:editEquipData.id?'#007AFF':'#34C759'}]} onPress={editEquipData.id ? saveEquipmentEdit : saveNewEquipment}>
                  <Text style={styles.btnText}>{editEquipData.id ? 'Save Changes' : 'Add to Inventory'}</Text>
                </TouchableOpacity>
                {editEquipData.id && (
                  <TouchableOpacity style={[styles.primaryBtn,{marginBottom:40,backgroundColor:'#FF3B30'}]} onPress={deleteEquipment}>
                    <Text style={styles.btnText}>Delete Equipment</Text>
                  </TouchableOpacity>
                )}
              </ScrollView>
            </KeyboardAvoidingView>
          </SafeAreaView>
        );

      case 'GYM_NETWORK': {
        const favoriteGyms = ownerDatabase.filter(g => (currentUser?.favorites||[]).includes(g.id));
        const customerFilteredGyms = ownerDatabase.filter(gym => {
          if (!gym.lat || !gym.lon) return false;
          const dist = getDistanceMiles(userLocation.latitude, userLocation.longitude, gym.lat, gym.lon);
          if (dist > parseFloat(searchFilters.radius||9999)) return false;
          if (searchFilters.maxPrice && gym.monthlyPrice > parseFloat(searchFilters.maxPrice)) return false;
          if (searchFilters.reqClass!=='All' && !(gym.classes||[]).includes(searchFilters.reqClass)) return false;
          if (searchFilters.openNow) { const open = isOpenNow(gym); if (open === false) return false; }
          if (searchFilters.reqEquipCategory!=='All'||searchFilters.reqMinWeight||searchFilters.reqMaxWeight||searchFilters.targetMuscle) {
            const hasEquip = (gym.equipment||[]).some(eq => {
              if (searchFilters.reqEquipCategory!=='All' && eq.category!==searchFilters.reqEquipCategory) return false;
              if (searchFilters.reqMinWeight && Number(eq.maxWeight)<Number(searchFilters.reqMinWeight)) return false;
              if (searchFilters.reqMaxWeight && Number(eq.minWeight)>Number(searchFilters.reqMaxWeight)) return false;
              if (searchFilters.targetMuscle && !(eq.targetArea||'').toLowerCase().includes(searchFilters.targetMuscle.toLowerCase())) return false;
              return true;
            });
            if (!hasEquip) return false;
          }
          if (isAiFiltering && aiPrompt) return Object.keys(aiMatchResults).includes(gym.id) || getAIMatchScore(gym, aiPrompt) > 0;
          return true;
        }).sort((a, b) => {
          if (!isAiFiltering && gymSortBy === 'DISTANCE') {
            if (a.featured && !b.featured) return -1;
            if (!a.featured && b.featured) return 1;
          }
          if (isAiFiltering) {
            const scoreA = aiMatchResults[a.id]?.score ?? getAIMatchScore(a, aiPrompt);
            const scoreB = aiMatchResults[b.id]?.score ?? getAIMatchScore(b, aiPrompt);
            return scoreB - scoreA;
          }
          if (gymSortBy === 'RATING') return getAvgRating(b.gymReviews) - getAvgRating(a.gymReviews);
          if (gymSortBy === 'PRICE') return (a.monthlyPrice||0) - (b.monthlyPrice||0);
          return getDistanceMiles(userLocation.latitude,userLocation.longitude,a.lat,a.lon) - getDistanceMiles(userLocation.latitude,userLocation.longitude,b.lat,b.lon);
        });
        const dynamicDelta = (parseFloat(searchFilters.radius||15)/69) * 2.2;

        return (
          <SafeAreaView style={styles.container}>
            <View style={{flex:1}}>
              <View style={[styles.padding,{paddingBottom:10}]}>
                <View style={styles.rowJustify}>
                  <Text style={styles.header}>Hey, {currentUser?.firstName} 👋</Text>
                  <TouchableOpacity onPress={handleLogout}><Text style={styles.backLink}>Logout</Text></TouchableOpacity>
                </View>
                <View style={styles.tabRow}>
                  {[['FIND_GYM','Find a Gym'],['FAVORITES','❤️'],['WALLET','🎟️ Wallet'],['PROFILE','Profile']].map(([key,label]) => (
                    <TouchableOpacity key={key} style={[styles.tabBtn,customerTab===key&&styles.tabBtnActive]} onPress={() => setCustomerTab(key)}>
                      <Text style={[styles.tabBtnText,customerTab===key&&styles.tabBtnTextActive]}>{label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {customerTab === 'FIND_GYM' && (
                <View style={{flex:1}}>
                  <View style={{paddingHorizontal:25}}>
                    <View style={styles.aiContainer}>
                      <View style={styles.rowJustify}>
                        <View style={{flexDirection:'row',alignItems:'center',gap:6}}>
                          <Text style={styles.aiTitle}>✨ AI Matchmaker</Text>
                          {memberIsPremium && <View style={[styles.aiBadge,{backgroundColor:'#FF9500'}]}><Text style={styles.aiBadgeText}>Premium ⭐</Text></View>}
                          {apiKey && usingRealAI && isAiFiltering && memberIsPremium && <View style={styles.aiBadge}><Text style={styles.aiBadgeText}>Claude ✓</Text></View>}
                        </View>
                        {memberIsPremium ? (
                          <TouchableOpacity onPress={() => setShowApiKeyModal(true)} style={styles.aiGearBtn}>
                            <Text style={{fontSize:16}}>{apiKey ? '🔑' : '⚙️'}</Text>
                          </TouchableOpacity>
                        ) : (
                          <TouchableOpacity onPress={() => setShowPremiumModal(true)} style={[styles.aiGearBtn,{backgroundColor:'#FF9500'}]}>
                            <Text style={{fontSize:12,fontWeight:'800',color:'#FFF'}}>PRO</Text>
                          </TouchableOpacity>
                        )}
                      </View>

                      {!memberIsPremium ? (
                        <TouchableOpacity style={styles.premiumGate} onPress={() => setShowPremiumModal(true)}>
                          <Text style={styles.premiumGateTitle}>⭐ Unlock AI Matchmaker</Text>
                          <Text style={styles.premiumGateSub}>Personalized gym recommendations powered by Claude AI. $4.99/month.</Text>
                          <View style={styles.premiumGateBtn}><Text style={styles.premiumGateBtnText}>Start Free Trial →</Text></View>
                        </TouchableOpacity>
                      ) : (
                        <>
                          {!apiKey && (
                            <TouchableOpacity onPress={() => setShowApiKeyModal(true)} style={styles.aiKeyNudge}>
                              <Text style={styles.aiKeyNudgeText}>⚡ Add your Anthropic API key for real AI results →</Text>
                            </TouchableOpacity>
                          )}
                          <View style={styles.aiSearchRow}>
                            <TextInput
                              style={styles.aiInput}
                              placeholder={apiKey ? 'e.g. I want to train boxing and build legs' : 'e.g. yoga classes near me'}
                              placeholderTextColor="#999"
                              value={aiPrompt}
                              onChangeText={t => { setAiPrompt(t); if(!t) { setIsAiFiltering(false); setAiMatchResults({}); setAiSummary(''); setAiSuggestions([]); setAiError(''); } }}
                              onSubmitEditing={handleAISearch}
                              returnKeyType="search"
                            />
                            <TouchableOpacity style={[styles.aiSearchIconBtn, isAiLoading && {opacity:0.6}]} onPress={handleAISearch} disabled={isAiLoading}>
                              {isAiLoading ? <ActivityIndicator size="small" color="#FFF"/> : <Text style={{fontSize:18}}>🔍</Text>}
                            </TouchableOpacity>
                          </View>
                        </>
                      )}

                      {isAiLoading && (
                        <View style={{flexDirection:'row',alignItems:'center',marginTop:10,gap:8}}>
                          <ActivityIndicator size="small" color="#5856D6"/>
                          <Text style={{color:'#5856D6',fontSize:13,fontWeight:'600'}}>{apiKey ? 'Claude is analyzing your goal...' : 'Searching gyms...'}</Text>
                        </View>
                      )}

                      {isAiFiltering && aiSummary ? (
                        <View style={styles.aiSummaryBox}>
                          <Text style={styles.aiSummaryText}>💬 {aiSummary}</Text>
                        </View>
                      ) : null}

                      {aiError ? <Text style={{color:'#E65100',fontSize:12,marginTop:8,fontStyle:'italic'}}>{aiError}</Text> : null}

                      {memberIsPremium && isAiFiltering && aiSuggestions.length > 0 && (
                        <View style={{marginTop:10}}>
                          <Text style={{fontSize:11,color:'#888',fontWeight:'600',marginBottom:6,textTransform:'uppercase'}}>🔄 Refine:</Text>
                          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                            {aiSuggestions.map((s, i) => (
                              <TouchableOpacity key={i} style={styles.aiSuggestionChip} onPress={() => handleRefineSearch(s)} disabled={isAiLoading}>
                                <Text style={styles.aiSuggestionText}>{s}</Text>
                              </TouchableOpacity>
                            ))}
                          </ScrollView>
                        </View>
                      )}

                      {memberIsPremium && !isAiFiltering && (currentUser?.savedSearches||[]).length > 0 && (
                        <View style={{marginTop:10}}>
                          <Text style={{fontSize:11,color:'#888',fontWeight:'600',marginBottom:6,textTransform:'uppercase'}}>Recent searches:</Text>
                          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                            {currentUser.savedSearches.map((s, i) => (
                              <TouchableOpacity key={i} style={styles.aiSuggestionChip} onPress={() => runAISearch(s, false)} disabled={isAiLoading}>
                                <Text style={styles.aiSuggestionText}>{s}</Text>
                              </TouchableOpacity>
                            ))}
                          </ScrollView>
                        </View>
                      )}

                      {memberIsPremium && isAiFiltering && (
                        <TouchableOpacity style={styles.clearAiBtn} onPress={() => { setIsAiFiltering(false); setAiPrompt(''); setAiMatchResults({}); setAiSummary(''); setAiSuggestions([]); setAiError(''); setUsingRealAI(false); setLastSearchTurn(null); }}>
                          <Text style={styles.clearAiText}>✕ Clear AI Results</Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    <View style={[styles.row,{gap:8,marginBottom:12}]}>
                      <TouchableOpacity style={[styles.filterChip,{flex:1,justifyContent:'center',alignItems:'center'}]} onPress={() => setShowSearchModal(true)}>
                        <Text style={styles.filterChipText}>🔍 Filters</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.filterChip,searchFilters.openNow&&styles.filterChipActive,{flex:1,justifyContent:'center',alignItems:'center'}]} onPress={() => setSearchFilters(p=>({...p,openNow:!p.openNow}))}>
                        <Text style={[styles.filterChipText,searchFilters.openNow&&styles.filterChipTextActive]}>🟢 Open Now</Text>
                      </TouchableOpacity>
                    </View>

                    {!isAiFiltering && (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom:12}}>
                        {[['DISTANCE','📍 Nearest'],['RATING','⭐ Top Rated'],['PRICE','💲 Price']].map(([key,label]) => (
                          <TouchableOpacity key={key} style={[styles.filterChip,gymSortBy===key&&styles.filterChipActive,{marginRight:8}]} onPress={() => setGymSortBy(key)}>
                            <Text style={[styles.filterChipText,gymSortBy===key&&styles.filterChipTextActive]}>{label}</Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    )}

                    <View style={[styles.rowJustify,{marginBottom:10}]}>
                      <Text style={styles.sectionLabel}>{customerFilteredGyms.length} Facilities Found</Text>
                      <View style={{flexDirection:'row',alignItems:'center'}}>
                        <Text style={{fontSize:12,marginRight:8,color:'#666'}}>{viewMode==='MAP'?'Map':'List'}</Text>
                        <Switch value={viewMode==='MAP'} onValueChange={v => setViewMode(v?'MAP':'LIST')}/>
                      </View>
                    </View>
                  </View>

                  {viewMode === 'MAP' ? (
                    <View style={{flex:1,borderRadius:20,overflow:'hidden',marginHorizontal:15,marginBottom:15}}>
                      <MapView style={{flex:1}} region={{latitude:userLocation.latitude,longitude:userLocation.longitude,latitudeDelta:dynamicDelta,longitudeDelta:dynamicDelta}} showsUserLocation>
                        <Circle center={userLocation} radius={parseFloat(searchFilters.radius||15)*1609.34} strokeWidth={2} strokeColor="rgba(0,122,255,0.5)" fillColor="rgba(0,122,255,0.1)"/>
                        {customerFilteredGyms.map(gym => (
                          <Marker key={gym.id} coordinate={{latitude:gym.lat,longitude:gym.lon}} title={gym.gymName} description={gym.pricing} onCalloutPress={() => { setSelectedGym(gym); setEquipFilter('All'); navigateTo('GYM_DETAIL'); }}/>
                        ))}
                      </MapView>
                    </View>
                  ) : (
                    <FlatList
                      contentContainerStyle={{paddingHorizontal:25}}
                      data={customerFilteredGyms}
                      keyExtractor={i=>i.id}
                      showsVerticalScrollIndicator={false}
                      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshGyms} tintColor="#5856D6"/>}
                      renderItem={({item}) => {
                        const dist = getDistanceMiles(userLocation.latitude,userLocation.longitude,item.lat,item.lon).toFixed(1);
                        const avgRat = getAvgRating(item.gymReviews);
                        const openStatus = isOpenNow(item);
                        const fav = isFavorite(item.id);
                        const matchData = isAiFiltering ? aiMatchResults[item.id] : null;
                        const matchScore = matchData?.score ?? (isAiFiltering ? getAIMatchScore(item, aiPrompt) : null);
                        const isExpanded = expandedMatchId === item.id;
                        return (
                          <View>
                            {matchData && (
                              <View style={{height:4,borderRadius:2,backgroundColor:'#EEE',marginBottom:2,overflow:'hidden'}}>
                                <View style={{width:`${matchData.score}%`,height:4,backgroundColor: matchData.score>=75?'#5856D6':matchData.score>=50?'#007AFF':'#8E8E93',borderRadius:2}}/>
                              </View>
                            )}
                            <TouchableOpacity style={[styles.itemCard,{marginBottom:matchData?4:12}, item.featured&&{borderColor:'#FF9500',borderWidth:1.5}]} onPress={() => { setSelectedGym(item); setEquipFilter('All'); navigateTo('GYM_DETAIL'); }}>
                              <View style={styles.rowJustify}>
                                <View style={{flex:1,flexDirection:'row',alignItems:'center',gap:6,marginRight:8}}>
                                  {item.featured && <View style={styles.featuredBadge}><Text style={styles.featuredBadgeText}>⭐ Featured</Text></View>}
                                  <Text style={[styles.itemTitle,{flex:1}]}>{item.gymName}</Text>
                                </View>
                                <View style={{flexDirection:'row',alignItems:'center',gap:8}}>
                                  <TouchableOpacity onPress={() => toggleFavorite(item.id)} hitSlop={{top:10,bottom:10,left:10,right:10}}>
                                    <Text style={{fontSize:20}}>{fav?'❤️':'🤍'}</Text>
                                  </TouchableOpacity>
                                  {isAiFiltering && matchScore !== null ? (
                                    <View style={[styles.aiMatchBadge, matchScore>=75&&styles.aiMatchBadgeStrong]}>
                                      <Text style={[styles.aiMatchBadgeText, matchScore>=75&&{color:'#FFF'}]}>{matchScore}% match</Text>
                                    </View>
                                  ) : (
                                    <Text style={{color:'#007AFF',fontWeight:'bold'}}>{dist} mi</Text>
                                  )}
                                </View>
                              </View>
                              <Text style={[styles.itemSub,{marginTop:2}]}>{item.location}</Text>
                              {getActivePromotion(item) && (
                                <View style={{backgroundColor:'#FFF3E0',paddingHorizontal:10,paddingVertical:6,borderRadius:8,marginTop:8}}>
                                  <Text style={{color:'#E65100',fontWeight:'700',fontSize:12}}>🔥 {getActivePromotion(item).title}</Text>
                                </View>
                              )}
                              <View style={[styles.row,{marginTop:8,alignItems:'center',flexWrap:'wrap',gap:6}]}>
                                {openStatus !== null && (
                                  <View style={{backgroundColor:openStatus?'#E8F8EF':'#FFE5E5',paddingHorizontal:8,paddingVertical:3,borderRadius:6}}>
                                    <Text style={{color:openStatus?'#34C759':'#FF3B30',fontWeight:'700',fontSize:11}}>{openStatus?'● Open Now':'● Closed'}</Text>
                                  </View>
                                )}
                                {avgRat > 0 && (
                                  <View style={{backgroundColor:'#FFF9E6',paddingHorizontal:8,paddingVertical:3,borderRadius:6}}>
                                    <Text style={{color:'#FF9500',fontWeight:'700',fontSize:11}}>★ {avgRat.toFixed(1)} ({item.gymReviews?.length||0})</Text>
                                  </View>
                                )}
                                <Text style={{color:'#34C759',fontWeight:'700',fontSize:12}}>{item.pricing}</Text>
                              </View>
                              {(item.classes||[]).length > 0 && (
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginTop:8}}>
                                  {item.classes.map(cls => (
                                    <View key={cls} style={{backgroundColor:'#F0F0F0',paddingHorizontal:10,paddingVertical:3,borderRadius:12,marginRight:6}}>
                                      <Text style={{fontSize:11,color:'#555',fontWeight:'600'}}>{cls}</Text>
                                    </View>
                                  ))}
                                </ScrollView>
                              )}
                            </TouchableOpacity>
                            {matchData && (
                              <TouchableOpacity style={[styles.aiMatchDetail, isExpanded && styles.aiMatchDetailExpanded]} onPress={() => setExpandedMatchId(isExpanded ? null : item.id)}>
                                <View style={styles.rowJustify}>
                                  <Text style={styles.aiMatchDetailTitle}>✨ Why this matches</Text>
                                  <Text style={{color:'#5856D6',fontSize:12,fontWeight:'600'}}>{isExpanded ? '▲ Less' : '▼ More'}</Text>
                                </View>
                                {isExpanded && (
                                  <>
                                    <Text style={styles.aiMatchReason}>{matchData.reason}</Text>
                                    {(matchData.highlights||[]).length > 0 && (
                                      <View style={{flexDirection:'row',flexWrap:'wrap',gap:6,marginTop:10}}>
                                        {matchData.highlights.map((h,i) => (
                                          <View key={i} style={styles.aiHighlightChip}><Text style={styles.aiHighlightText}>✓ {h}</Text></View>
                                        ))}
                                      </View>
                                    )}
                                  </>
                                )}
                              </TouchableOpacity>
                            )}
                            {matchData && <View style={{height:8}}/>}
                          </View>
                        );
                      }}
                    />
                  )}
                </View>
              )}

              {customerTab === 'FAVORITES' && (
                <ScrollView contentContainerStyle={{paddingHorizontal:25,paddingBottom:40}}>
                  <Text style={styles.sectionLabel}>Saved Gyms ({favoriteGyms.length})</Text>
                  {favoriteGyms.length > 0 ? favoriteGyms.map(item => {
                    const dist = getDistanceMiles(userLocation.latitude,userLocation.longitude,item.lat,item.lon).toFixed(1);
                    const avgRat = getAvgRating(item.gymReviews);
                    const openStatus = isOpenNow(item);
                    return (
                      <TouchableOpacity key={item.id} style={styles.itemCard} onPress={() => { setSelectedGym(item); setEquipFilter('All'); navigateTo('GYM_DETAIL'); }}>
                        <View style={styles.rowJustify}>
                          <Text style={[styles.itemTitle,{flex:1}]}>{item.gymName}</Text>
                          <TouchableOpacity onPress={() => toggleFavorite(item.id)}><Text style={{fontSize:20}}>❤️</Text></TouchableOpacity>
                        </View>
                        <Text style={[styles.itemSub,{marginTop:2}]}>{item.location}</Text>
                        <View style={[styles.row,{marginTop:8,alignItems:'center',gap:6}]}>
                          {openStatus !== null && (
                            <View style={{backgroundColor:openStatus?'#E8F8EF':'#FFE5E5',paddingHorizontal:8,paddingVertical:3,borderRadius:6}}>
                              <Text style={{color:openStatus?'#34C759':'#FF3B30',fontWeight:'700',fontSize:11}}>{openStatus?'● Open':'● Closed'}</Text>
                            </View>
                          )}
                          {avgRat > 0 && <Text style={{color:'#FF9500',fontWeight:'700',fontSize:12}}>★ {avgRat.toFixed(1)}</Text>}
                          <Text style={{color:'#007AFF',fontWeight:'700',fontSize:12}}>{dist} mi</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  }) : (
                    <View style={{alignItems:'center',paddingTop:60}}>
                      <Text style={{fontSize:50,marginBottom:15}}>🤍</Text>
                      <Text style={{fontSize:18,fontWeight:'bold',color:'#333',marginBottom:8}}>No Saved Gyms Yet</Text>
                      <Text style={{color:'#666',textAlign:'center'}}>Tap the heart on any gym to save it here.</Text>
                    </View>
                  )}
                </ScrollView>
              )}

              {customerTab === 'WALLET' && (() => {
                const passes = currentUser?.activePasses || [];
                const activePasses = passes.filter(p => !p.expiresAt || new Date(p.expiresAt) > new Date());
                const expiredPasses = passes.filter(p => p.expiresAt && new Date(p.expiresAt) <= new Date());
                // Expiring within 3 days
                const expiringSoon = activePasses.filter(p => {
                  if (!p.expiresAt) return false;
                  const days = (new Date(p.expiresAt) - Date.now()) / 86400000;
                  return days <= 3;
                });
                return (
                  <ScrollView contentContainerStyle={{paddingHorizontal:25,paddingBottom:40}}>
                    {expiringSoon.length > 0 && (
                      <View style={{backgroundColor:'#FFF3CD',borderWidth:1,borderColor:'#FF9500',borderRadius:14,padding:14,marginBottom:16}}>
                        <Text style={{fontWeight:'800',color:'#E65100',fontSize:15,marginBottom:6}}>⚠️ Expiring Soon</Text>
                        {expiringSoon.map(p => {
                          const days = Math.ceil((new Date(p.expiresAt) - Date.now()) / 86400000);
                          return (
                            <Text key={p.id} style={{color:'#555',fontSize:13,marginBottom:3}}>
                              • <Text style={{fontWeight:'700'}}>{p.gymName}</Text> — {p.label} expires in <Text style={{fontWeight:'700',color:'#FF3B30'}}>{days} day{days!==1?'s':''}</Text>
                            </Text>
                          );
                        })}
                      </View>
                    )}

                    <View style={{flexDirection:'row',gap:12,marginBottom:16}}>
                      {[
                        {label:'Active', value:activePasses.length, color:'#34C759'},
                        {label:'Expired', value:expiredPasses.length, color:'#FF3B30'},
                        {label:'Total', value:passes.length, color:'#007AFF'},
                      ].map(s => (
                        <View key={s.label} style={{flex:1,backgroundColor:s.color+'15',padding:12,borderRadius:12,alignItems:'center'}}>
                          <Text style={{fontSize:22,fontWeight:'900',color:s.color}}>{s.value}</Text>
                          <Text style={{color:'#666',fontSize:11,fontWeight:'600'}}>{s.label}</Text>
                        </View>
                      ))}
                    </View>

                    <Text style={styles.sectionLabel}>Active Passes ({activePasses.length})</Text>
                    {activePasses.length === 0 ? (
                      <View style={{alignItems:'center',paddingVertical:30}}>
                        <Text style={{fontSize:40,marginBottom:10}}>🎟️</Text>
                        <Text style={{fontWeight:'700',color:'#333',fontSize:16,marginBottom:6}}>No active passes</Text>
                        <Text style={{color:'#888',textAlign:'center',fontSize:13}}>Browse gyms and purchase a pass to get started.</Text>
                        <TouchableOpacity style={[styles.primaryBtn,{marginTop:16,paddingHorizontal:28}]} onPress={() => setCustomerTab('FIND_GYM')}>
                          <Text style={styles.btnText}>Find a Gym →</Text>
                        </TouchableOpacity>
                      </View>
                    ) : activePasses.map(pass => {
                      const hasPunch = pass.remainingPunches !== null && pass.remainingPunches !== undefined;
                      const daysLeft = pass.expiresAt ? Math.ceil((new Date(pass.expiresAt) - Date.now()) / 86400000) : null;
                      return (
                        <TouchableOpacity key={pass.id} style={[styles.itemCard,{borderLeftWidth:4,borderLeftColor:'#34C759'}]} onPress={() => { setViewingQR(pass); navigateTo('ACTIVE_PASS_VIEW'); }}>
                          <View style={styles.rowJustify}>
                            <Text style={styles.itemTitle}>{pass.gymName}</Text>
                            <Text style={{color:'#34C759',fontWeight:'bold',fontSize:12}}>Active ●</Text>
                          </View>
                          <Text style={{fontWeight:'600',color:'#333',marginTop:4}}>{pass.label}</Text>
                          <View style={[styles.row,{marginTop:6,gap:12,flexWrap:'wrap'}]}>
                            {hasPunch && <Text style={{color:'#007AFF',fontWeight:'700',fontSize:12}}>{pass.remainingPunches}/{pass.totalPunches} scans left</Text>}
                            {daysLeft !== null && <Text style={{color:daysLeft<=3?'#FF3B30':'#666',fontWeight:'600',fontSize:12}}>{daysLeft <= 0 ? 'Expires today' : `${daysLeft}d remaining`}</Text>}
                          </View>
                          <Text style={{color:'#34C759',fontWeight:'700',fontSize:12,marginTop:4}}>Tap to show QR →</Text>
                        </TouchableOpacity>
                      );
                    })}

                    {expiredPasses.length > 0 && (<>
                      <Text style={[styles.sectionLabel,{marginTop:10}]}>Expired Passes</Text>
                      {expiredPasses.map(pass => (
                        <View key={pass.id} style={[styles.itemCard,{opacity:0.6,borderLeftWidth:4,borderLeftColor:'#FF3B30'}]}>
                          <View style={styles.rowJustify}>
                            <Text style={styles.itemTitle}>{pass.gymName}</Text>
                            <Text style={{color:'#FF3B30',fontWeight:'bold',fontSize:12}}>Expired</Text>
                          </View>
                          <Text style={{fontWeight:'600',color:'#333',marginTop:4}}>{pass.label}</Text>
                          <Text style={{color:'#999',fontSize:12,marginTop:4}}>Expired: {new Date(pass.expiresAt).toLocaleDateString()}</Text>
                        </View>
                      ))}
                    </>)}
                  </ScrollView>
                );
              })()}

              {customerTab === 'PROFILE' && (
                <ScrollView contentContainerStyle={{paddingHorizontal:25}}>
                  {memberCheckins.length > 0 && (() => {
                    const stats = computeCheckinStats(memberCheckins);
                    return (
                      <View style={[styles.infoBox,{backgroundColor:'#F0F4FF',borderColor:'#C7D6FF',borderWidth:1,marginBottom:15}]}>
                        <View style={styles.rowJustify}>
                          <Text style={{fontSize:16,fontWeight:'800',color:'#3A4CA8'}}>🔥 {stats.currentStreak}-day streak</Text>
                          <Text style={{fontSize:14,fontWeight:'700',color:'#3A4CA8'}}>{stats.totalVisits} visits</Text>
                        </View>
                        {stats.badges.length > 0 && (
                          <View style={{flexDirection:'row',flexWrap:'wrap',gap:6,marginTop:10}}>
                            {stats.badges.map(b => (
                              <View key={b.threshold} style={{backgroundColor:'#FFF',paddingHorizontal:10,paddingVertical:4,borderRadius:12,borderWidth:1,borderColor:'#C7D6FF'}}>
                                <Text style={{fontSize:11,fontWeight:'700',color:'#3A4CA8'}}>🏅 {b.label}</Text>
                              </View>
                            ))}
                          </View>
                        )}
                      </View>
                    );
                  })()}
                  {currentUser?.referralCode && (
                    <TouchableOpacity style={[styles.infoBox,{backgroundColor:'#1C1C1E',borderWidth:0,marginBottom:15}]} onPress={shareReferralCode}>
                      <View style={styles.rowJustify}>
                        <View>
                          <Text style={{fontSize:16, fontWeight:'800', color:'#FFF'}}>🎁 Invite a friend</Text>
                          <Text style={{fontSize:12, color:'#CCC', marginTop:3}}>
                            Your code: {currentUser.referralCode}
                            {currentUser.referralCount > 0 ? `  •  ${currentUser.referralCount} joined so far` : ''}
                          </Text>
                        </View>
                        <Text style={{fontSize:14, fontWeight:'700', color:'#FFF'}}>Share →</Text>
                      </View>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={[styles.infoBox, memberIsPremium ? {backgroundColor:'#FFF9EE', borderColor:'#FF9500', borderWidth:1.5} : {backgroundColor:'#F0F0F0', borderColor:'#DDD', borderWidth:1}]}
                    onPress={() => setShowPremiumModal(true)}
                  >
                    <View style={styles.rowJustify}>
                      <View>
                        <Text style={{fontSize:16, fontWeight:'800', color: memberIsPremium ? '#E65100' : '#555'}}>
                          {memberIsPremium ? '⭐ iGym Premium Active' : '⭐ Upgrade to Premium'}
                        </Text>
                        <Text style={{fontSize:12, color: memberIsPremium ? '#FF9500' : '#888', marginTop:3}}>
                          ${MEMBER_PREMIUM_PRICE}/month • {memberIsPremium ? 'AI Matchmaker unlocked' : 'Unlock AI gym finder'}
                        </Text>
                      </View>
                      <Text style={{fontSize:22}}>{memberIsPremium ? '✓' : '→'}</Text>
                    </View>
                  </TouchableOpacity>

                  <View style={{height:1,backgroundColor:'#EEE',marginVertical:20}}/>
                  <Text style={styles.sectionLabel}>Account Details</Text>
                  <TextInput style={styles.input} value={profileEditForm.email} onChangeText={t => setProfileEditForm(p=>({...p,email:t}))} placeholder="Email" keyboardType="email-address" autoCapitalize="none"/>
                  <TextInput style={styles.input} value={profileEditForm.username} onChangeText={t => setProfileEditForm(p=>({...p,username:t}))} placeholder="Username" autoCapitalize="none"/>
                  <TextInput style={styles.input} value={profileEditForm.password} onChangeText={t => setProfileEditForm(p=>({...p,password:t}))} placeholder="Password" secureTextEntry/>
                  <Text style={[styles.sectionLabel,{marginTop:10}]}>Home Address</Text>
                  <TextInput style={styles.input} value={profileEditForm.address} onChangeText={t => setProfileEditForm(p=>({...p,address:t}))} placeholder="Street Address"/>
                  <View style={styles.row}>
                    <TextInput style={[styles.input,{flex:1,marginRight:10}]} value={profileEditForm.city} onChangeText={t => setProfileEditForm(p=>({...p,city:t}))} placeholder="City"/>
                    <TouchableOpacity style={[styles.input,{flex:1,marginRight:10,justifyContent:'center'}]} onPress={() => { setStateMenuTarget('PROF'); setShowStateMenu(true); }}>
                      <Text style={{color:profileEditForm.state?'#000':'#999'}}>{profileEditForm.state||'State'}</Text>
                    </TouchableOpacity>
                    <TextInput style={[styles.input,{flex:1}]} value={profileEditForm.zip} keyboardType="numeric" onChangeText={t => setProfileEditForm(p=>({...p,zip:t}))} placeholder="Zip"/>
                  </View>
                  <TouchableOpacity style={[styles.primaryBtn,{marginTop:10,marginBottom:40}]} onPress={saveCustomerProfile}>
                    <Text style={styles.btnText}>Save Changes</Text>
                  </TouchableOpacity>
                </ScrollView>
              )}
            </View>

            <Modal visible={showSearchModal} animationType="slide">
              <SafeAreaView style={styles.container}>
                <ScrollView contentContainerStyle={styles.padding}>
                  <View style={styles.rowJustify}>
                    <Text style={styles.header}>Search Filters</Text>
                    <TouchableOpacity onPress={() => setShowSearchModal(false)}><Text style={styles.backLink}>Done</Text></TouchableOpacity>
                  </View>
                  <Text style={styles.sectionLabel}>Search Location</Text>
                  <View style={styles.row}>
                    <TextInput style={[styles.input,{flex:1,marginRight:10,marginBottom:0}]} value={customSearchAddress} onChangeText={setCustomSearchAddress} placeholder="City, Zip, or Address"/>
                    <TouchableOpacity style={[styles.primaryBtn,{backgroundColor:'#5856D6',paddingHorizontal:15}]} onPress={handleLocationSearch} disabled={isGeocoding}>
                      {isGeocoding?<ActivityIndicator color="#FFF"/>:<Text style={styles.btnText}>Search</Text>}
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity style={{marginTop:10,marginBottom:15}} onPress={resetToCurrentLocation}>
                    <Text style={{color:'#007AFF',fontWeight:'bold',fontSize:14}}>📍 Use My GPS Location</Text>
                  </TouchableOpacity>
                  <Text style={styles.sectionLabel}>Distance & Budget</Text>
                  <TextInput style={styles.input} value={searchFilters.radius} onChangeText={t => setSearchFilters(p=>({...p,radius:t}))} placeholder="Max Distance (miles) e.g. 15" keyboardType="numeric"/>
                  <TextInput style={styles.input} value={searchFilters.maxPrice} onChangeText={t => setSearchFilters(p=>({...p,maxPrice:t}))} placeholder="Max Monthly Budget ($)" keyboardType="numeric"/>
                  <View style={[styles.rowJustify,{marginVertical:10,backgroundColor:'#F8F8F8',padding:15,borderRadius:12}]}>
                    <Text style={{fontWeight:'600',color:'#333'}}>🟢 Open Now Only</Text>
                    <Switch value={searchFilters.openNow} onValueChange={v => setSearchFilters(p=>({...p,openNow:v}))}/>
                  </View>
                  <Text style={styles.sectionLabel}>Equipment Filters</Text>
                  <TextInput style={styles.input} value={searchFilters.targetMuscle} onChangeText={t => setSearchFilters(p=>({...p,targetMuscle:t}))} placeholder="Target Muscle (e.g. Chest, Quads)"/>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom:10}}>
                    {['All',...EQUIP_CATEGORIES].map(cat => (
                      <TouchableOpacity key={cat} style={[styles.filterChip,searchFilters.reqEquipCategory===cat&&styles.filterChipActive]} onPress={() => setSearchFilters(p=>({...p,reqEquipCategory:cat}))}>
                        <Text style={[styles.filterChipText,searchFilters.reqEquipCategory===cat&&styles.filterChipTextActive]}>{cat}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  <View style={styles.row}>
                    <TextInput style={[styles.input,{flex:1,marginRight:10}]} value={searchFilters.reqMinWeight} onChangeText={t => setSearchFilters(p=>({...p,reqMinWeight:t}))} placeholder="Min Weight (lbs)" keyboardType="numeric"/>
                    <TextInput style={[styles.input,{flex:1}]} value={searchFilters.reqMaxWeight} onChangeText={t => setSearchFilters(p=>({...p,reqMaxWeight:t}))} placeholder="Max Weight (lbs)" keyboardType="numeric"/>
                  </View>
                  <Text style={styles.sectionLabel}>Required Classes</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom:20}}>
                    {['All',...CLASS_TYPES].map(cls => (
                      <TouchableOpacity key={cls} style={[styles.filterChip,searchFilters.reqClass===cls&&styles.filterChipActive]} onPress={() => setSearchFilters(p=>({...p,reqClass:cls}))}>
                        <Text style={[styles.filterChipText,searchFilters.reqClass===cls&&styles.filterChipTextActive]}>{cls}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  <TouchableOpacity style={[styles.primaryBtn,{marginTop:10}]} onPress={() => setShowSearchModal(false)}>
                    <Text style={styles.btnText}>Apply Filters</Text>
                  </TouchableOpacity>
                </ScrollView>
              </SafeAreaView>
            </Modal>
          </SafeAreaView>
        );
      }

      case 'GYM_DETAIL': {
        const displayEquipment = (selectedGym?.equipment||[]).filter(eq => equipFilter==='All'||eq.category===equipFilter);
        const gymTrainers = selectedGym?.trainers||[];
        const gymAvgRating = getAvgRating(selectedGym?.gymReviews);
        const gymOpenStatus = isOpenNow(selectedGym);
        const gymFaved = isFavorite(selectedGym?.id);
        return (
          <SafeAreaView style={styles.container}>
            <ScrollView style={{flex:1,padding:25}}>
              <View style={styles.rowJustify}>
                <TouchableOpacity onPress={() => { setSelectedGym(null); navigateTo('GYM_NETWORK'); }}><Text style={styles.backLink}>← Back</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => toggleFavorite(selectedGym.id)}>
                  <Text style={{fontSize:26}}>{gymFaved?'❤️':'🤍'}</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.header}>{selectedGym?.gymName}</Text>
              <Text style={styles.subHeader}>{selectedGym?.location}</Text>

              {getActivePromotion(selectedGym) && (
                <View style={{backgroundColor:'#FFF3E0',padding:14,borderRadius:12,marginBottom:15}}>
                  <Text style={{color:'#E65100',fontWeight:'800',fontSize:15}}>🔥 {getActivePromotion(selectedGym).title}</Text>
                  {!!getActivePromotion(selectedGym).detail && <Text style={{color:'#BF6000',fontSize:13,marginTop:4}}>{getActivePromotion(selectedGym).detail}</Text>}
                </View>
              )}

              <View style={[styles.row,{flexWrap:'wrap',gap:8,marginBottom:15}]}>
                {gymOpenStatus !== null && (
                  <View style={{backgroundColor:gymOpenStatus?'#E8F8EF':'#FFE5E5',paddingHorizontal:12,paddingVertical:5,borderRadius:8}}>
                    <Text style={{color:gymOpenStatus?'#34C759':'#FF3B30',fontWeight:'800'}}>{gymOpenStatus?'● Open Now':'● Closed'}</Text>
                  </View>
                )}
                {gymAvgRating > 0 && (
                  <View style={{backgroundColor:'#FFF9E6',paddingHorizontal:12,paddingVertical:5,borderRadius:8}}>
                    <Text style={{color:'#FF9500',fontWeight:'700'}}>★ {gymAvgRating.toFixed(1)} ({selectedGym.gymReviews?.length} reviews)</Text>
                  </View>
                )}
              </View>

              <View style={styles.infoBox}>
                <Text style={styles.infoText}>📞 {selectedGym?.phone||'No phone provided'}</Text>
                <Text style={styles.infoText}>💳 {selectedGym?.pricing||'Pricing unavailable'}</Text>
                {selectedGym?.hoursDisplay && <Text style={styles.infoText}>⏰ {selectedGym.hoursDisplay}</Text>}
              </View>

              <Text style={[styles.sectionLabel,{marginTop:15}]}>🎟️ Access Passes</Text>
              {(selectedGym?.passes||[]).length > 0 ? selectedGym.passes.map(pass => (
                <TouchableOpacity key={pass.id} style={[styles.primaryBtn,{backgroundColor:'#34C759',marginBottom:10}]} onPress={() => { setSelectedPass(pass); navigateTo('PAYMENT_PORTAL'); }}>
                  <View style={styles.rowJustify}>
                    <Text style={styles.btnText}>🎟️ {pass.label}</Text>
                    <Text style={styles.btnText}>${pass.price.toFixed(2)}</Text>
                  </View>
                  <Text style={{color:'#FFF',fontSize:12,marginTop:4,fontWeight:'500'}}>{pass.type==='TIME'?`Valid ${pass.value} day(s)`:`${pass.value} scans included`}</Text>
                </TouchableOpacity>
              )) : selectedGym?.dayPassPrice > 0 ? (
                <TouchableOpacity style={[styles.primaryBtn,{backgroundColor:'#34C759',marginBottom:10}]} onPress={() => { setSelectedPass({id:'dp',label:'Day Pass',price:selectedGym.dayPassPrice,type:'TIME',value:1}); navigateTo('PAYMENT_PORTAL'); }}>
                  <View style={styles.rowJustify}><Text style={styles.btnText}>🎟️ Day Pass</Text><Text style={styles.btnText}>${selectedGym.dayPassPrice.toFixed(2)}</Text></View>
                </TouchableOpacity>
              ) : <Text style={{fontStyle:'italic',color:'#999',marginBottom:15}}>No passes listed.</Text>}

              {gymTrainers.length > 0 && (
                <View style={{marginTop:10}}>
                  <Text style={styles.sectionLabel}>Personal Trainers</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {gymTrainers.map(trainer => (
                      <View key={trainer.id} style={{backgroundColor:'#F8F8F8',padding:15,borderRadius:12,marginRight:15,width:250,borderWidth:1,borderColor:'#EEE'}}>
                        <Text style={{fontSize:18,fontWeight:'bold'}}>{trainer.name}</Text>
                        <Text style={{color:'#007AFF',fontWeight:'bold',marginBottom:8}}>${trainer.fee}/hr</Text>
                        <Text style={{color:'#555',fontSize:13,marginBottom:15}}>{trainer.bio}</Text>
                        <TouchableOpacity style={{backgroundColor:'#111',padding:10,borderRadius:8,alignItems:'center'}} onPress={() => { setSelectedTrainer(trainer); navigateTo('TRAINER_BOOKING'); }}>
                          <Text style={{color:'#FFF',fontWeight:'bold'}}>Book Session</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </ScrollView>
                </View>
              )}

              <Text style={{marginVertical:15,color:'#444',lineHeight:22}}>{selectedGym?.description}</Text>

              <Text style={styles.sectionLabel}>Equipment ({displayEquipment.length})</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom:15}}>
                {['All',...EQUIP_CATEGORIES].map(cat => (
                  <TouchableOpacity key={cat} style={[styles.filterChip,equipFilter===cat&&styles.filterChipActive]} onPress={() => setEquipFilter(cat)}>
                    <Text style={[styles.filterChipText,equipFilter===cat&&styles.filterChipTextActive]}>{cat}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <FlatList data={displayEquipment} keyExtractor={i=>i.id} showsVerticalScrollIndicator={false} renderItem={({item}) => (
                <TouchableOpacity style={styles.itemCard} onPress={() => { setSelectedEquipment(item); navigateTo('EQUIP_DETAIL'); }}>
                  <View style={styles.rowJustify}><Text style={styles.itemTitle}>{item.name}</Text><Text style={styles.categoryBadge}>{item.category}</Text></View>
                  <Text style={{marginTop:6,color:'#555',fontSize:13}}>Target: {item.targetArea}</Text>
                </TouchableOpacity>
              )}/>

              <Text style={[styles.sectionLabel,{marginTop:20}]}>Member Reviews</Text>
              {(selectedGym?.gymReviews||[]).length > 0 ? (selectedGym.gymReviews||[]).map(rev => (
                <View key={rev.id} style={styles.reviewCard}>
                  <View style={styles.rowJustify}>
                    <Text style={{fontWeight:'bold'}}>@{rev.username}</Text>
                    <View style={{flexDirection:'row',alignItems:'center',gap:6}}>
                      <Text style={{color:'#FF9500',fontSize:13}}>{renderStars(rev.rating)}</Text>
                      <Text style={{color:'#999',fontSize:11}}>{new Date(rev.date).toLocaleDateString()}</Text>
                    </View>
                  </View>
                  <Text style={{marginTop:6,color:'#444',lineHeight:20}}>{rev.text}</Text>
                </View>
              )) : <Text style={{color:'#888',fontStyle:'italic',marginBottom:10}}>Be the first to review this gym!</Text>}

              <View style={{flexDirection:'row',marginBottom:10}}>
                {[1,2,3,4,5].map(n => (
                  <TouchableOpacity key={n} onPress={() => setGymReviewRating(n)} style={{paddingRight:5}}>
                    <Text style={{fontSize:28,color:gymReviewRating>=n?'#FF9500':'#DDD'}}>{gymReviewRating>=n?'★':'☆'}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput style={[styles.input,{height:80,textAlignVertical:'top'}]} placeholder="Share your experience at this gym..." multiline value={gymReviewText} onChangeText={setGymReviewText}/>
              <TouchableOpacity style={[styles.primaryBtn,{backgroundColor:'#FF9500',marginBottom:50}]} onPress={submitGymReview}>
                <Text style={styles.btnText}>Post Gym Review</Text>
              </TouchableOpacity>
            </ScrollView>
          </SafeAreaView>
        );
      }

      case 'TRAINER_BOOKING':
        return (
          <SafeAreaView style={styles.container}>
            <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':'height'} style={{flex:1}}>
              <ScrollView style={{flex:1,padding:25}} keyboardShouldPersistTaps="handled">
                <TouchableOpacity onPress={() => navigateTo('GYM_DETAIL')}><Text style={styles.backLink}>← Back to {selectedGym?.gymName}</Text></TouchableOpacity>
                <Text style={styles.header}>Book a Session</Text>
                <View style={[styles.infoBox,{marginTop:10}]}>
                  <Text style={{fontSize:22,fontWeight:'bold'}}>{selectedTrainer?.name}</Text>
                  <Text style={{fontSize:18,color:'#34C759',fontWeight:'bold',marginVertical:8}}>${selectedTrainer?.fee}/hr</Text>
                  <Text style={{fontSize:16,color:'#444',lineHeight:22}}>{selectedTrainer?.bio}</Text>
                </View>
                <Text style={styles.sectionLabel}>Session Request</Text>
                <TextInput
                  style={[styles.input,{height:120,textAlignVertical:'top'}]}
                  placeholder="Describe your fitness goals, experience level, and preferred days/times..."
                  multiline
                  value={bookingMessage}
                  onChangeText={setBookingMessage}
                />
                <View style={[styles.infoBox,{backgroundColor:'#F0FFF4',marginBottom:20}]}>
                  <Text style={{fontSize:13,color:'#2E7D32',lineHeight:19}}>
                    📧 Your request will be sent to <Text style={{fontWeight:'700'}}>{selectedTrainer?.name}</Text> at {selectedGym?.gymName}. They'll follow up at <Text style={{fontWeight:'700'}}>{currentUser?.email}</Text>.
                  </Text>
                </View>
                <TouchableOpacity style={[styles.primaryBtn,{backgroundColor:'#007AFF'}]} onPress={handleSubmitBooking}>
                  <Text style={styles.btnText}>Submit Booking Request</Text>
                </TouchableOpacity>
              </ScrollView>
            </KeyboardAvoidingView>
          </SafeAreaView>
        );

      case 'PAYMENT_PORTAL':
        return (
          <SafeAreaView style={styles.container}>
            <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':'height'} style={{flex:1}}>
              <ScrollView contentContainerStyle={styles.padding} keyboardShouldPersistTaps="handled">
                <TouchableOpacity onPress={() => navigateTo('GYM_DETAIL')}><Text style={styles.backLink}>← Back</Text></TouchableOpacity>
                <Text style={styles.header}>Checkout</Text>
                <View style={[styles.infoBox,{backgroundColor:'#F2F2F7',borderWidth:0}]}>
                  <Text style={{fontSize:18,fontWeight:'bold'}}>{selectedGym?.gymName}</Text>
                  <View style={[styles.rowJustify,{marginTop:10}]}>
                    <Text style={{fontSize:16,color:'#333'}}>{selectedPass?.label}</Text>
                    <Text style={{fontSize:18,fontWeight:'bold',color:'#34C759'}}>${selectedPass?.price.toFixed(2)}</Text>
                  </View>
                  <Text style={{marginTop:5,fontSize:12,color:'#888'}}>{selectedPass?.type==='TIME'?`Valid ${selectedPass.value} day(s) from start date`:`${selectedPass.value} gym entry scans included`}</Text>
                  <TouchableOpacity
                    style={[styles.rowJustify,{marginTop:12,paddingTop:12,borderTopWidth:1,borderTopColor:'#DDD'}]}
                    onPress={() => { setDatePickerField('passStart'); setShowDatePicker(true); }}
                  >
                    <Text style={{color:'#666',fontSize:13}}>Starts on</Text>
                    <Text style={{color:'#007AFF',fontSize:13,fontWeight:'700'}}>
                      {selectedPassStartDate.toDateString() === new Date().toDateString() ? 'Today (change)' : `${selectedPassStartDate.toLocaleDateString()} (change)`}
                    </Text>
                  </TouchableOpacity>
                  <View style={{marginTop:14,paddingTop:14,borderTopWidth:1,borderTopColor:'#DDD'}}>
                    <View style={[styles.rowJustify,{marginBottom:6}]}>
                      <Text style={{color:'#666',fontSize:13}}>Pass price</Text>
                      <Text style={{color:'#333',fontSize:13,fontWeight:'600'}}>${selectedPass?.price.toFixed(2)}</Text>
                    </View>
                    <View style={[styles.rowJustify,{marginBottom:6}]}>
                      <Text style={{color:'#666',fontSize:13}}>Platform fee (12%)</Text>
                      <Text style={{color:'#FF3B30',fontSize:13,fontWeight:'600'}}>−${(selectedPass?.price * PLATFORM_FEE_RATE).toFixed(2)}</Text>
                    </View>
                    <View style={[styles.rowJustify,{paddingTop:8,borderTopWidth:1,borderTopColor:'#DDD'}]}>
                      <Text style={{color:'#333',fontSize:13,fontWeight:'700'}}>Gym receives</Text>
                      <Text style={{color:'#34C759',fontSize:15,fontWeight:'800'}}>${(selectedPass?.price * (1 - PLATFORM_FEE_RATE)).toFixed(2)}</Text>
                    </View>
                  </View>
                </View>
                <Text style={styles.sectionLabel}>Secure Payment</Text>
                <TextInput style={styles.input} placeholder="Cardholder Name" value={cardDetails.name} onChangeText={t => setCardDetails(p=>({...p,name:t}))}/>
                <TextInput style={styles.input} placeholder="Card Number" keyboardType="numeric" maxLength={16} value={cardDetails.number} onChangeText={t => setCardDetails(p=>({...p,number:t}))}/>
                <View style={styles.row}>
                  <TextInput style={[styles.input,{flex:1,marginRight:10}]} placeholder="MM/YY" keyboardType="numeric" maxLength={5} value={cardDetails.exp} onChangeText={t => setCardDetails(p=>({...p,exp:t}))}/>
                  <TextInput style={[styles.input,{flex:1}]} placeholder="CVV" keyboardType="numeric" maxLength={4} secureTextEntry value={cardDetails.cvv} onChangeText={t => setCardDetails(p=>({...p,cvv:t}))}/>
                </View>
                <TouchableOpacity style={[styles.primaryBtn,{marginTop:20,backgroundColor:'#000'}]} onPress={handlePaymentSubmit} disabled={isProcessingPayment}>
                  {isProcessingPayment?<ActivityIndicator color="#FFF"/>:<Text style={styles.btnText}>Pay & Generate QR Pass</Text>}
                </TouchableOpacity>
                <Text style={{textAlign:'center',marginTop:20,color:'#999',fontSize:12}}>🔒 Encrypted & secure checkout</Text>
              </ScrollView>
            </KeyboardAvoidingView>
          </SafeAreaView>
        );

      case 'ACTIVE_PASS_VIEW': {
        const passExpired = new Date(viewingQR?.expiresAt) < new Date();
        const passPunches = viewingQR?.remainingPunches !== null && viewingQR?.remainingPunches !== undefined;
        return (
          <SafeAreaView style={styles.container}>
            <View style={styles.padding}>
              <TouchableOpacity onPress={() => { setViewingQR(null); navigateTo('GYM_NETWORK'); }}><Text style={styles.backLink}>← Back to Wallet</Text></TouchableOpacity>
              <View style={styles.ticketCard}>
                <Text style={{fontSize:24,fontWeight:'900',textAlign:'center'}}>{viewingQR?.gymName}</Text>
                <Text style={{fontSize:18,fontWeight:'600',textAlign:'center',color:'#5856D6',marginVertical:8}}>{viewingQR?.label}</Text>
                <View style={{alignItems:'center',marginVertical:25}}>
                  <View style={{padding:18,backgroundColor:'#FFF',borderRadius:10,shadowColor:'#000',shadowOffset:{width:0,height:2},shadowOpacity:0.1,shadowRadius:4,elevation:3}}>
                    <QRCode value={viewingQR?.id||'ERROR'} size={175} color="black" backgroundColor="white"/>
                  </View>
                  <Text style={{color:'#999',fontSize:12,marginTop:12}}>Present to gym scanner</Text>
                  <Text style={{marginTop:12,fontFamily:Platform.OS==='ios'?'Courier':'monospace',fontWeight:'bold',fontSize:13}}>{viewingQR?.id}</Text>
                </View>
                <View style={styles.rowJustify}>
                  <View>
                    <Text style={{color:'#8E8E93',fontSize:11,fontWeight:'bold'}}>EXPIRES</Text>
                    <Text style={{fontWeight:'700',color:passExpired?'#FF3B30':'#000'}}>{new Date(viewingQR?.expiresAt).toLocaleDateString()}</Text>
                  </View>
                  {passPunches && (
                    <View style={{alignItems:'flex-end'}}>
                      <Text style={{color:'#8E8E93',fontSize:11,fontWeight:'bold'}}>SCANS LEFT</Text>
                      <Text style={{fontSize:22,fontWeight:'900',color:viewingQR.remainingPunches===0?'#FF3B30':'#34C759'}}>
                        {viewingQR.remainingPunches} <Text style={{fontSize:14,color:'#666'}}>/ {viewingQR.totalPunches}</Text>
                      </Text>
                    </View>
                  )}
                </View>
                {passExpired && <Text style={{color:'#FF3B30',fontWeight:'bold',textAlign:'center',marginTop:18}}>This pass has expired.</Text>}
              </View>
              {!passExpired && (
                <TouchableOpacity style={[styles.secondaryBtn,{marginTop:25,backgroundColor:'#E5E5EA'}]} onPress={() => handleMockGymScan(viewingQR.id)}>
                  <Text style={[styles.btnText,{color:'#000'}]}>[Demo] Simulate Desk Scan</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={[styles.secondaryBtn,{marginTop:12,backgroundColor:'#FF3B30'}]} onPress={() => handleRemovePassFromWallet(viewingQR.id)}>
                <Text style={styles.btnText}>🗑️ Delete from Wallet</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        );
      }

      case 'EQUIP_DETAIL':
        return (
          <SafeAreaView style={styles.container}>
            <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':'height'} style={{flex:1}}>
              <ScrollView style={{flex:1,padding:25}} keyboardShouldPersistTaps="handled">
                <TouchableOpacity onPress={() => { setSelectedEquipment(null); navigateTo('GYM_DETAIL'); }}><Text style={styles.backLink}>← Back</Text></TouchableOpacity>
                <View style={styles.rowJustify}>
                  <Text style={[styles.header,{flex:1,marginRight:10}]}>{selectedEquipment?.name}</Text>
                  <Text style={styles.categoryBadge}>{selectedEquipment?.category}</Text>
                </View>
                {selectedEquipment?.image ? <Image source={{uri:selectedEquipment.image}} style={styles.equipImage}/> : <View style={styles.mediaPlaceholder}><Text>📷 No Image</Text></View>}
                {selectedEquipment?.muscleDiagram ? (
                  <>
                    <Text style={styles.sectionLabel}>Muscle Diagram</Text>
                    <Image source={{uri:selectedEquipment.muscleDiagram}} style={[styles.equipImage,{height:200}]}/>
                  </>
                ) : null}
                <Text style={styles.sectionLabel}>Target Muscle Groups</Text>
                <Text style={styles.descriptionText}>{selectedEquipment?.targetArea}</Text>
                {(selectedEquipment?.minWeight||selectedEquipment?.maxWeight) && (
                  <>
                    <Text style={styles.sectionLabel}>Weight Range</Text>
                    <Text style={styles.descriptionText}>{selectedEquipment.minWeight} – {selectedEquipment.maxWeight} lbs</Text>
                  </>
                )}
                <Text style={styles.sectionLabel}>How To Use</Text>
                <TouchableOpacity style={styles.videoContainer} onPress={() => Alert.alert('Video Player','Launching instructional video...')}>
                  <ImageBackground source={{uri:selectedEquipment?.videoThumbnail||'https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?q=80&w=1000'}} style={styles.videoThumbnail} imageStyle={{borderRadius:12}}>
                    <View style={styles.playButtonOverlay}><Text style={styles.playIcon}>▶</Text></View>
                  </ImageBackground>
                </TouchableOpacity>
                <Text style={styles.sectionLabel}>Written Instructions</Text>
                <Text style={styles.descriptionText}>{selectedEquipment?.instructions}</Text>

                {selectedEquipment?.description ? (
                  <>
                    <Text style={styles.sectionLabel}>About This Equipment</Text>
                    <Text style={styles.descriptionText}>{selectedEquipment.description}</Text>
                  </>
                ) : null}

                {(selectedEquipment?.workouts||[]).length > 0 && (
                  <>
                    <Text style={styles.sectionLabel}>💪 Suggested Workouts</Text>
                    {(selectedEquipment.workouts||[]).map((workout, i) => {
                      const colonIdx = workout.indexOf(':');
                      const wName = colonIdx > -1 ? workout.slice(0, colonIdx) : `Workout ${i+1}`;
                      const wDesc = colonIdx > -1 ? workout.slice(colonIdx+1).trim() : workout;
                      return (
                        <View key={i} style={styles.workoutCard}>
                          <Text style={styles.workoutCardTitle}>{wName}</Text>
                          <Text style={styles.workoutCardDesc}>{wDesc}</Text>
                        </View>
                      );
                    })}
                  </>
                )}

                {selectedEquipment?.maintenance ? (
                  <>
                    <Text style={styles.sectionLabel}>🔧 Maintenance Notes</Text>
                    <View style={{backgroundColor:'#FFF8E1', padding:14, borderRadius:12, marginBottom:15}}>
                      <Text style={{color:'#555', fontSize:14, lineHeight:21}}>{selectedEquipment.maintenance}</Text>
                    </View>
                  </>
                ) : null}
                <Text style={styles.sectionLabel}>Community Reviews</Text>
                {(selectedEquipment?.reviews||[]).length > 0 ? selectedEquipment.reviews.map(rev => (
                  <View key={rev.id} style={styles.reviewCard}>
                    <View style={styles.rowJustify}><Text style={{fontWeight:'bold'}}>@{rev.user}</Text><Text>{rev.rating}</Text></View>
                    <Text style={{marginTop:6,color:'#444',lineHeight:20}}>{rev.text}</Text>
                  </View>
                )) : <Text style={{color:'#888',fontStyle:'italic',marginBottom:10}}>No reviews yet.</Text>}
                <TextInput style={[styles.input,{height:80,textAlignVertical:'top'}]} placeholder="How was the equipment?" multiline value={reviewInput} onChangeText={setReviewInput}/>
                <TouchableOpacity style={styles.primaryBtn} onPress={submitReview}><Text style={styles.btnText}>Post Review</Text></TouchableOpacity>
                <View style={{height:60}}/>
              </ScrollView>
            </KeyboardAvoidingView>
          </SafeAreaView>
        );

      default:
        return <View style={styles.container}><Text>Screen Not Found</Text></View>;
    }
  };

  return (
    <View style={{flex:1}}>
      <StatusBar barStyle="light-content"/>
      <Animated.View style={{flex:1, opacity: fadeAnim, transform:[{translateY: slideAnim}]}}>
        {renderScreen()}
      </Animated.View>

      {showDatePicker && Platform.OS==='android' && (
        <DateTimePicker
          value={datePickerField==='passStart' ? selectedPassStartDate : new Date()}
          mode="date"
          display="default"
          minimumDate={datePickerField==='passStart' ? new Date() : undefined}
          onChange={(e,d) => { setShowDatePicker(false); if(d) { if (datePickerField==='passStart') setSelectedPassStartDate(d); else setEditEquipData(p=>({...p,[datePickerField]:d.toLocaleDateString()})); } }}
        />
      )}
      <Modal visible={showDatePicker && Platform.OS==='ios'} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.calendarCard,{height:'auto',maxHeight:500,paddingBottom:30}]}>
            <View style={[styles.rowJustify,{marginBottom:15}]}>
              <Text style={styles.modalTitle}>Select Date</Text>
              <TouchableOpacity onPress={() => setShowDatePicker(false)}><Text style={styles.backLink}>Done</Text></TouchableOpacity>
            </View>
            <DateTimePicker
              value={datePickerField==='passStart' ? selectedPassStartDate : new Date()}
              mode="date"
              display="inline"
              minimumDate={datePickerField==='passStart' ? new Date() : undefined}
              onChange={(e,d) => { if(d) { if (datePickerField==='passStart') setSelectedPassStartDate(d); else setEditEquipData(p=>({...p,[datePickerField]:d.toLocaleDateString()})); } }}
            />
          </View>
        </View>
      </Modal>

      <Modal visible={showStateMenu} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.stateMenuCard}>
            <Text style={styles.modalTitle}>Select State</Text>
            <FlatList data={US_STATES} keyExtractor={i=>i} renderItem={({item}) => (
              <TouchableOpacity style={styles.stateOption} onPress={() => {
                if (stateMenuTarget==='REG') setRegData(p=>({...p,state:item}));
                else setProfileEditForm(p=>({...p,state:item}));
                setShowStateMenu(false);
              }}>
                <Text style={styles.stateText}>{item}</Text>
              </TouchableOpacity>
            )}/>
          </View>
        </View>
      </Modal>

      <Modal visible={showApiKeyModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':'height'} style={{width:'90%'}}>
            <View style={styles.apiKeyCard}>
              <View style={[styles.rowJustify,{marginBottom:18}]}>
                <Text style={{fontSize:20,fontWeight:'800',color:'#111'}}>✨ AI Matchmaker Setup</Text>
                <TouchableOpacity onPress={() => setShowApiKeyModal(false)}><Text style={{fontSize:22,color:'#999'}}>✕</Text></TouchableOpacity>
              </View>
              <View style={{backgroundColor:'#F2F2F7',padding:14,borderRadius:12,marginBottom:18}}>
                <Text style={{fontSize:13,color:'#444',lineHeight:20}}>
                  Connect your <Text style={{fontWeight:'700'}}>Anthropic API key</Text> to unlock real Claude AI matching.
                  {'\n\n'}Without a key, iGym uses local keyword matching as a fallback.
                </Text>
                <TouchableOpacity onPress={() => Linking.openURL('https://console.anthropic.com/settings/keys')} style={{marginTop:10}}>
                  <Text style={{color:'#007AFF',fontWeight:'600',fontSize:13}}>Get your key at console.anthropic.com →</Text>
                </TouchableOpacity>
              </View>
              <Text style={{fontSize:12,color:'#8E8E93',fontWeight:'700',marginBottom:8,textTransform:'uppercase'}}>Your API Key</Text>
              <TextInput
                style={[styles.input,{marginBottom:10}]}
                placeholder="sk-ant-api03-..."
                placeholderTextColor="#BBB"
                value={tempApiKey}
                onChangeText={setTempApiKey}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry={!!(apiKey && tempApiKey === apiKey)}
              />
              {apiKey && (
                <View style={{flexDirection:'row',alignItems:'center',gap:6,marginBottom:12,backgroundColor:'#E8F8EF',padding:10,borderRadius:10}}>
                  <Text style={{color:'#34C759',fontWeight:'700'}}>✓ Key active</Text>
                  <Text style={{color:'#555',fontSize:12}}>...{apiKey.slice(-8)}</Text>
                </View>
              )}
              <TouchableOpacity style={[styles.primaryBtn,{backgroundColor:'#5856D6',marginBottom:10}]} onPress={saveApiKey}>
                <Text style={styles.btnText}>{apiKey ? 'Update Key' : 'Save & Enable AI'}</Text>
              </TouchableOpacity>
              {apiKey && (
                <TouchableOpacity style={[styles.primaryBtn,{backgroundColor:'#FF3B30'}]} onPress={removeApiKey}>
                  <Text style={styles.btnText}>Remove Key</Text>
                </TouchableOpacity>
              )}
              <Text style={{textAlign:'center',color:'#C7C7CC',fontSize:11,marginTop:14}}>
                Your key is stored only on this device.
              </Text>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <Modal visible={showPremiumModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.apiKeyCard, {maxHeight:'85%'}]}>
            <View style={[styles.rowJustify, {marginBottom:20}]}>
              <Text style={{fontSize:22, fontWeight:'900', color:'#111'}}>⭐ iGym Premium</Text>
              <TouchableOpacity onPress={() => setShowPremiumModal(false)}><Text style={{fontSize:22, color:'#999'}}>✕</Text></TouchableOpacity>
            </View>
            <View style={{backgroundColor:'#FFF9EE', borderRadius:16, padding:20, marginBottom:20, borderWidth:1, borderColor:'#FF9500'}}>
              <Text style={{fontSize:32, fontWeight:'900', color:'#FF9500', textAlign:'center'}}>${MEMBER_PREMIUM_PRICE}<Text style={{fontSize:16, fontWeight:'600'}}>/month</Text></Text>
              <Text style={{color:'#E65100', textAlign:'center', marginTop:4, fontSize:13}}>Cancel anytime • 7-day free trial</Text>
            </View>
            {[
              ['✨', 'AI-Powered Matchmaker', 'Claude finds your perfect gym using natural language.'],
              ['🎯', 'Smart Recommendations', 'Personalized picks based on your preferences.'],
              ['⚡', 'Priority Match Scoring', 'See how well each gym fits your needs.'],
              ['🔔', 'Equipment Alerts', 'Get notified when gyms add equipment you want.'],
            ].map(([icon, title, desc]) => (
              <View key={title} style={{flexDirection:'row', gap:14, marginBottom:16, alignItems:'flex-start'}}>
                <Text style={{fontSize:24}}>{icon}</Text>
                <View style={{flex:1}}>
                  <Text style={{fontWeight:'700', fontSize:15, color:'#111'}}>{title}</Text>
                  <Text style={{color:'#666', fontSize:13, lineHeight:18, marginTop:3}}>{desc}</Text>
                </View>
              </View>
            ))}
            <TouchableOpacity style={[styles.primaryBtn, {backgroundColor:'#FF9500', marginTop:10, paddingVertical:18}]} onPress={handleUpgradeMemberPremium}>
              <Text style={[styles.btnText, {fontSize:17}]}>Start Free Trial — ${MEMBER_PREMIUM_PRICE}/mo</Text>
            </TouchableOpacity>
            {memberIsPremium && (
              <TouchableOpacity style={{marginTop:12, padding:12}} onPress={() => { setMemberIsPremium(false); setShowPremiumModal(false); }}>
                <Text style={{color:'#FF3B30', textAlign:'center', fontSize:13}}>Cancel Premium Subscription</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={showSubscriptionModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <ScrollView style={{width:'100%'}} contentContainerStyle={{alignItems:'center', padding:20}}>
            <View style={[styles.apiKeyCard, {width:'100%', maxWidth:500}]}>
              <View style={[styles.rowJustify, {marginBottom:6}]}>
                <Text style={{fontSize:22, fontWeight:'900', color:'#111'}}>Subscription</Text>
                <TouchableOpacity onPress={() => setShowSubscriptionModal(false)}><Text style={{fontSize:22, color:'#999'}}>✕</Text></TouchableOpacity>
              </View>
              <Text style={{color:'#888', fontSize:13, marginBottom:20}}>Manage your iGym owner plan for {currentOwner?.gymName}</Text>

              {Object.entries(PLAN_TIERS).map(([key, tier]) => {
                const isCurrent = getOwnerPlan(currentOwner) === key;
                const isLower = ['free','basic','pro'].indexOf(key) < ['free','basic','pro'].indexOf(getOwnerPlan(currentOwner));
                return (
                  <View key={key} style={[styles.subscriptionCard, isCurrent && {borderColor: tier.color, borderWidth:2}]}>
                    <View style={[styles.rowJustify, {marginBottom:10}]}>
                      <View style={{flexDirection:'row', alignItems:'center', gap:8}}>
                        <Text style={{fontSize:22}}>{tier.emoji}</Text>
                        <Text style={{fontSize:18, fontWeight:'800', color: tier.color}}>{tier.name}</Text>
                        {isCurrent && <View style={[styles.planBadge, {backgroundColor: tier.color + '20', borderColor: tier.color}]}><Text style={[styles.planBadgeText, {color: tier.color}]}>Current</Text></View>}
                      </View>
                      <Text style={{fontSize:20, fontWeight:'900', color:'#111'}}>{tier.price === 0 ? 'Free' : `$${tier.price}/mo`}</Text>
                    </View>
                    {tier.features.map(f => (
                      <View key={f} style={{flexDirection:'row', alignItems:'flex-start', gap:8, marginBottom:6}}>
                        <Text style={{color: tier.color, fontWeight:'700', marginTop:1}}>✓</Text>
                        <Text style={{color:'#444', fontSize:13, flex:1}}>{f}</Text>
                      </View>
                    ))}
                    {!isCurrent && !isLower && (
                      <TouchableOpacity style={[styles.primaryBtn, {backgroundColor: tier.color, marginTop:14}]} onPress={() => handleUpgradePlan(key)}>
                        <Text style={styles.btnText}>Upgrade to {tier.name} →</Text>
                      </TouchableOpacity>
                    )}
                    {!isCurrent && isLower && (
                      <TouchableOpacity style={[styles.primaryBtn, {backgroundColor:'#EEE', marginTop:14}]} onPress={() => handleDowngradePlan(key)}>
                        <Text style={[styles.btnText, {color:'#555'}]}>Switch to {tier.name}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}

              <View style={[styles.infoBox, {marginTop:8, backgroundColor:'#F0FFF4'}]}>
                <Text style={{fontWeight:'700', color:'#2E7D32', marginBottom:8}}>💰 Revenue Share Model</Text>
                <View style={styles.rowJustify}><Text style={{color:'#555', fontSize:13}}>You keep</Text><Text style={{fontWeight:'800', color:'#34C759', fontSize:16}}>88%</Text></View>
                <View style={styles.rowJustify}><Text style={{color:'#555', fontSize:13}}>Platform fee</Text><Text style={{fontWeight:'700', color:'#FF3B30', fontSize:14}}>12%</Text></View>
                <Text style={{color:'#888', fontSize:12, marginTop:10}}>Platform fees apply only to passes sold through iGym.</Text>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

// ─── ROOT EXPORT — wraps with StripeProvider + ErrorBoundary ───────────
export default function App() {
  return (
    <ErrorBoundary>
      <StripeProvider publishableKey={env.STRIPE_PUBLISHABLE || 'pk_test_placeholder'}>
        <IGymApp />
      </StripeProvider>
    </ErrorBoundary>
  );
}

// ─── STYLES ────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:          { flex:1, backgroundColor:'#FFF' },
  fullScreen:         { flex:1 },
  overlay:            { flex:1, backgroundColor:'rgba(0,0,0,0.7)', justifyContent:'center', padding:40 },
  padding:            { padding:25 },
  brandText:          { color:'#FFF', fontSize:60, fontWeight:'900', textAlign:'center', marginBottom:5 },
  taglineText:        { color:'#FFF', fontSize:18, fontWeight:'500', textAlign:'center', marginBottom:30, fontStyle:'italic' },
  loginCard:          { backgroundColor:'rgba(255,255,255,0.1)', padding:20, borderRadius:20, marginBottom:20 },
  header:             { fontSize:32, fontWeight:'800', color:'#111', marginBottom:10 },
  subHeader:          { fontSize:16, color:'#666', marginBottom:20 },
  input:              { backgroundColor:'#F0F0F0', padding:16, borderRadius:12, marginBottom:15, color:'#000', justifyContent:'center' },
  primaryBtn:         { backgroundColor:'#007AFF', padding:18, borderRadius:12, alignItems:'center' },
  secondaryBtn:       { backgroundColor:'#34C759', padding:18, borderRadius:12, alignItems:'center', marginTop:10 },
  btnText:            { color:'#FFF', fontWeight:'bold', fontSize:16 },
  linkRow:            { flexDirection:'row', justifyContent:'center', alignItems:'center' },
  whiteLink:          { color:'#DDD', fontSize:14 },
  boldText:           { fontWeight:'bold' },
  separator:          { color:'#666', marginHorizontal:10 },
  ownerLinkText:      { color:'#007AFF', fontWeight:'bold', textAlign:'center', marginTop:30 },
  backLink:           { color:'#007AFF', marginBottom:15, fontWeight:'600' },
  row:                { flexDirection:'row' },
  rowJustify:         { flexDirection:'row', justifyContent:'space-between', alignItems:'center' },
  sectionLabel:       { color:'#8E8E93', fontSize:12, fontWeight:'bold', marginVertical:15, textTransform:'uppercase' },
  uploadBtn:          { borderStyle:'dashed', borderWidth:2, borderColor:'#DDD', height:100, borderRadius:12, marginBottom:15, justifyContent:'center', alignItems:'center', overflow:'hidden' },
  previewImage:       { width:'100%', height:'100%', resizeMode:'cover' },
  modalOverlay:       { flex:1, backgroundColor:'rgba(0,0,0,0.5)', justifyContent:'center', alignItems:'center' },
  calendarCard:       { backgroundColor:'#FFF', width:'80%', borderRadius:20, padding:20 },
  modalTitle:         { fontSize:18, fontWeight:'bold', textAlign:'center' },
  itemCard:           { backgroundColor:'#F8F8F8', padding:20, borderRadius:15, marginBottom:12, borderWidth:1, borderColor:'#EEE' },
  itemTitle:          { fontSize:18, fontWeight:'700', flexShrink:1 },
  itemSub:            { color:'#666' },
  tabRow:             { flexDirection:'row', marginBottom:20, backgroundColor:'#F0F0F0', borderRadius:12, padding:4 },
  tabBtn:             { flex:1, paddingVertical:10, alignItems:'center', borderRadius:10 },
  tabBtnActive:       { backgroundColor:'#FFF', shadowColor:'#000', shadowOffset:{width:0,height:2}, shadowOpacity:0.1, shadowRadius:4, elevation:2 },
  tabBtnText:         { color:'#666', fontWeight:'bold', fontSize:12 },
  tabBtnTextActive:   { color:'#007AFF' },
  infoBox:            { backgroundColor:'#F8F8F8', padding:15, borderRadius:12, marginBottom:15, borderWidth:1, borderColor:'#EEE' },
  infoText:           { fontSize:15, color:'#333', marginBottom:6, fontWeight:'500' },
  filterChip:         { paddingHorizontal:16, paddingVertical:9, borderRadius:20, backgroundColor:'#F0F0F0', marginRight:8 },
  filterChipActive:   { backgroundColor:'#007AFF' },
  filterChipText:     { color:'#333', fontWeight:'600', fontSize:13 },
  filterChipTextActive: { color:'#FFF' },
  categoryBadge:      { backgroundColor:'#E5F1FF', color:'#007AFF', paddingHorizontal:10, paddingVertical:4, borderRadius:8, fontSize:12, fontWeight:'bold', overflow:'hidden' },
  equipImage:         { width:'100%', height:250, borderRadius:15, marginVertical:15, backgroundColor:'#EEE' },
  mediaPlaceholder:   { width:'100%', height:200, backgroundColor:'#EEE', borderRadius:15, justifyContent:'center', alignItems:'center', marginVertical:15 },
  descriptionText:    { fontSize:16, lineHeight:24, color:'#444', marginBottom:10 },
  reviewCard:         { backgroundColor:'#F0F0F0', padding:15, borderRadius:12, marginBottom:10 },
  videoContainer:     { width:'100%', height:200, marginBottom:20, borderRadius:12, overflow:'hidden', backgroundColor:'#000' },
  videoThumbnail:     { width:'100%', height:'100%', justifyContent:'center', alignItems:'center' },
  playButtonOverlay:  { width:60, height:60, backgroundColor:'rgba(0,0,0,0.6)', borderRadius:30, justifyContent:'center', alignItems:'center', borderWidth:2, borderColor:'#FFF' },
  playIcon:           { color:'#FFF', fontSize:24, marginLeft:4 },
  aiContainer:        { backgroundColor:'#F2F2F7', padding:15, borderRadius:18, marginBottom:12, borderWidth:1, borderColor:'#E5E5EA' },
  aiTitle:            { fontSize:16, fontWeight:'bold', color:'#5856D6', marginBottom:8 },
  aiSearchRow:        { flexDirection:'row', alignItems:'center', backgroundColor:'#FFF', borderRadius:12, paddingRight:10, borderWidth:1, borderColor:'#E5E5EA' },
  aiInput:            { backgroundColor:'transparent', padding:12, borderRadius:10, flex:1, color:'#000' },
  aiSearchIconBtn:    { backgroundColor:'#5856D6', width:44, height:44, borderRadius:10, justifyContent:'center', alignItems:'center', marginLeft:10 },
  clearAiBtn:         { marginTop:10, alignSelf:'center' },
  clearAiText:        { color:'#FF3B30', fontWeight:'bold', fontSize:12 },
  stateMenuCard:      { backgroundColor:'#FFF', width:'80%', height:'60%', borderRadius:20, padding:20 },
  stateOption:        { paddingVertical:15, borderBottomWidth:1, borderBottomColor:'#EEE', alignItems:'center' },
  stateText:          { fontSize:18, fontWeight:'600', color:'#333' },
  ticketCard:         { backgroundColor:'#FFF', padding:25, borderRadius:20, borderWidth:2, borderColor:'#000', shadowColor:'#000', shadowOffset:{width:0,height:4}, shadowOpacity:0.1, shadowRadius:10, elevation:5 },

  aiBadge:              { backgroundColor:'#EEF0FF', paddingHorizontal:8, paddingVertical:3, borderRadius:8 },
  aiBadgeText:          { color:'#5856D6', fontSize:11, fontWeight:'800' },
  aiGearBtn:            { padding:7, backgroundColor:'#EBEBF0', borderRadius:9 },
  aiKeyNudge:           { backgroundColor:'#EEF0FF', paddingHorizontal:12, paddingVertical:9, borderRadius:9, marginTop:8, marginBottom:2 },
  aiKeyNudgeText:       { color:'#5856D6', fontSize:12, fontWeight:'600' },
  aiSummaryBox:         { backgroundColor:'#EEF0FF', padding:12, borderRadius:10, marginTop:10 },
  aiSummaryText:        { color:'#3730A3', fontSize:13, lineHeight:19, fontWeight:'500' },
  aiSuggestionChip:     { backgroundColor:'#FFF', borderWidth:1, borderColor:'#C7D2FE', paddingHorizontal:12, paddingVertical:7, borderRadius:16, marginRight:8 },
  aiSuggestionText:     { color:'#5856D6', fontSize:12, fontWeight:'600' },
  aiMatchBadge:         { backgroundColor:'#EEF0FF', paddingHorizontal:9, paddingVertical:3, borderRadius:8 },
  aiMatchBadgeStrong:   { backgroundColor:'#5856D6' },
  aiMatchBadgeText:     { color:'#5856D6', fontSize:11, fontWeight:'800' },
  aiMatchDetail:        { backgroundColor:'#F8F7FF', borderWidth:1, borderColor:'#C7D2FE', borderTopWidth:0, borderRadius:12, borderTopLeftRadius:0, borderTopRightRadius:0, padding:14, marginBottom:0 },
  aiMatchDetailExpanded:{ backgroundColor:'#EEF0FF' },
  aiMatchDetailTitle:   { fontSize:13, fontWeight:'700', color:'#5856D6' },
  aiMatchReason:        { color:'#333', fontSize:13, lineHeight:20, marginTop:8 },
  aiHighlightChip:      { backgroundColor:'#5856D6', paddingHorizontal:10, paddingVertical:5, borderRadius:20 },
  aiHighlightText:      { color:'#FFF', fontSize:11, fontWeight:'700' },
  apiKeyCard:           { backgroundColor:'#FFF', borderRadius:22, padding:24, width:'100%', shadowColor:'#000', shadowOffset:{width:0,height:10}, shadowOpacity:0.18, shadowRadius:24, elevation:12 },

  planPillBtn:          { flexDirection:'row', alignItems:'center', paddingHorizontal:10, paddingVertical:5, borderRadius:10, borderWidth:1, marginTop:5, alignSelf:'flex-start' },
  proGate:              { backgroundColor:'#FFFAF0', borderWidth:1.5, borderColor:'#FF9500', borderRadius:14, padding:18, marginBottom:14 },
  proGateTitle:         { fontSize:16, fontWeight:'800', color:'#E65100', marginBottom:5 },
  proGateSub:           { fontSize:13, color:'#666', lineHeight:18, marginBottom:10 },
  proGateAction:        { color:'#FF9500', fontWeight:'700', fontSize:13 },

  planBadge:              { paddingHorizontal:10, paddingVertical:4, borderRadius:20, borderWidth:1, alignSelf:'flex-start', marginTop:4 },
  planBadgeText:          { fontSize:11, fontWeight:'700' },
  featuredBadge:          { backgroundColor:'#FF9500', paddingHorizontal:8, paddingVertical:3, borderRadius:6 },
  featuredBadgeText:      { color:'#FFF', fontSize:11, fontWeight:'800' },
  revenueCard:            { backgroundColor:'#F8F8F8', borderRadius:16, padding:18, marginBottom:14, borderWidth:1, borderColor:'#EEE' },
  revenueRow:             { flexDirection:'row' },
  revenueStatBlock:       { flex:1, alignItems:'center', paddingVertical:8 },
  revenueAmount:          { fontSize:24, fontWeight:'900', color:'#111' },
  revenueLabel:           { fontSize:11, color:'#888', fontWeight:'600', marginTop:3, textAlign:'center' },
  subscriptionCard:       { backgroundColor:'#FFF', borderRadius:16, padding:18, marginBottom:14, borderWidth:1, borderColor:'#EEE', shadowColor:'#000', shadowOffset:{width:0,height:2}, shadowOpacity:0.06, shadowRadius:8, elevation:3 },
  premiumGate:            { backgroundColor:'#FFF9EE', borderRadius:16, padding:18, marginTop:8, borderWidth:1.5, borderColor:'#FF9500', alignItems:'center' },
  premiumGateTitle:       { fontSize:17, fontWeight:'800', color:'#FF9500', marginBottom:6 },
  premiumGateSub:         { color:'#555', fontSize:13, textAlign:'center', lineHeight:18, marginBottom:14 },
  premiumGateBtn:         { backgroundColor:'#FF9500', paddingHorizontal:24, paddingVertical:10, borderRadius:20 },
  premiumGateBtnText:     { color:'#FFF', fontWeight:'800', fontSize:14 },

  brandWebsiteChip:         { backgroundColor:'#EEF0FF', paddingHorizontal:10, paddingVertical:5, borderRadius:10, borderWidth:1, borderColor:'#C7D2FE' },
  brandWebsiteChipText:     { color:'#5856D6', fontSize:12, fontWeight:'700' },
  brandNotFoundRow:         { flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginTop:10, paddingTop:10, borderTopWidth:1, borderTopColor:'#EEE' },
  brandNotFoundText:        { color:'#5856D6', fontSize:12, fontWeight:'600', flex:1 },
  brandNotFoundFooter:      { flexDirection:'row', alignItems:'center', backgroundColor:'#EEF0FF', padding:18, borderRadius:16, marginTop:8, marginBottom:20, borderWidth:1, borderColor:'#C7D2FE' },
  brandNotFoundFooterTitle: { fontSize:16, fontWeight:'800', color:'#3730A3', marginBottom:4 },
  brandNotFoundFooterSub:   { fontSize:13, color:'#555' },

  equipSearchBar:   { flexDirection:'row', alignItems:'center', backgroundColor:'#F0F0F0', borderRadius:14, paddingLeft:16, paddingRight:6, paddingVertical:6, borderWidth:1, borderColor:'#E0E0E0' },
  equipSearchInput: { flex:1, fontSize:15, color:'#111', paddingVertical:8 },
  equipSearchBtn:   { backgroundColor:'#5856D6', width:42, height:42, borderRadius:10, justifyContent:'center', alignItems:'center' },
  equipSearchCard:  { backgroundColor:'#F8F8F8', borderRadius:16, padding:16, marginBottom:14, borderWidth:1, borderColor:'#EEE' },

  equipAiCard:          { backgroundColor:'#F8F7FF', borderWidth:1.5, borderColor:'#C7D2FE', borderRadius:18, padding:18, marginBottom:10 },
  equipAiTitle:         { fontSize:17, fontWeight:'800', color:'#3730A3' },
  equipAiSubtitle:      { fontSize:13, color:'#555', marginTop:6, lineHeight:18 },
  equipAiBtn:           { backgroundColor:'#5856D6', paddingVertical:14, borderRadius:12, alignItems:'center', justifyContent:'center' },
  equipAiBtnDisabled:   { backgroundColor:'#BDBDBD' },
  equipAiBtnIcon:       { fontSize:22, marginBottom:4 },
  equipAiBtnText:       { color:'#FFF', fontWeight:'700', fontSize:14 },
  equipAiLoading:       { flexDirection:'row', alignItems:'center', backgroundColor:'#EEF0FF', padding:14, borderRadius:12, marginTop:14 },
  equipAiError:         { backgroundColor:'#FFEBEE', padding:14, borderRadius:12, marginTop:14 },
  equipAiResults:       { backgroundColor:'#FFF', borderRadius:14, padding:16, marginTop:14, borderWidth:1, borderColor:'#C7D2FE' },
  equipAiResultName:    { fontSize:15, fontWeight:'800', color:'#1A1A2E', flex:1, marginRight:8 },
  equipAiConfBadge:     { paddingHorizontal:8, paddingVertical:4, borderRadius:6 },
  equipAiWorkout:       { flexDirection:'row', alignItems:'flex-start', backgroundColor:'#F8F7FF', padding:10, borderRadius:10, marginBottom:8 },

  workoutCard:          { backgroundColor:'#F0EDFF', borderRadius:12, padding:14, marginBottom:10, borderLeftWidth:3, borderLeftColor:'#5856D6' },
  workoutCardTitle:     { fontSize:14, fontWeight:'800', color:'#3730A3', marginBottom:4 },
  workoutCardDesc:      { fontSize:13, color:'#444', lineHeight:19 },
});
