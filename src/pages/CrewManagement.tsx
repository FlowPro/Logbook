import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useForm, useFieldArray, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { PlusCircle, Edit, Trash2, Users, Save, X, FileText, AlertTriangle } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { toast } from 'sonner'
import { db } from '../db/database'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { CountrySelect } from '../components/ui/CountrySelect'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Modal } from '../components/ui/Modal'
import { FileUpload } from '../components/ui/FileUpload'
import type { CrewMember } from '../db/models'

const schema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  dateOfBirth: z.string().min(1),
  nationality: z.string().min(1),
  passportNumber: z.string(),
  passportExpiry: z.string(),
  street: z.string(),
  city: z.string(),
  postCode: z.string(),
  country: z.string(),
  phone: z.string(),
  email: z.string(),
  emergencyContact: z.string(),
  emergencyPhone: z.string(),
  bloodType: z.string().optional(),
  medications: z.string().optional(),
  allergies: z.string().optional(),
  qualifications: z.array(z.object({
    name: z.string(),
    issuedBy: z.string(),
    issuedDate: z.string(),
    number: z.string(),
  })),
  role: z.enum(['skipper', 'crew', 'passenger']),
  isActive: z.boolean(),
})

type FormData = z.infer<typeof schema>

const DEFAULTS: FormData = {
  firstName: '', lastName: '', dateOfBirth: '', nationality: '',
  passportNumber: '', passportExpiry: '',
  street: '', city: '', postCode: '', country: '',
  phone: '', email: '', emergencyContact: '', emergencyPhone: '',
  qualifications: [],
  role: 'crew',
  isActive: true,
}

export function CrewManagement() {
  const { t } = useTranslation()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null)
  const [passportCopy, setPassportCopy] = useState<string | undefined>()
  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)
  const [showInactive, setShowInactive] = useState(false)

  const crew = useLiveQuery(() => db.crew.toArray())

  const ROLE_ORDER: Record<string, number> = { skipper: 0, crew: 1, passenger: 2 }

  const sortedCrew = useMemo(() => {
    if (!crew) return []
    return [...crew].sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1
      const ra = ROLE_ORDER[a.role] ?? 3
      const rb = ROLE_ORDER[b.role] ?? 3
      if (ra !== rb) return ra - rb
      return a.lastName.localeCompare(b.lastName)
    })
  }, [crew])

  const visibleCrew = showInactive ? sortedCrew : sortedCrew.filter(m => m.isActive)
  const inactiveCount = sortedCrew.filter(m => !m.isActive).length

  const { register, control, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: DEFAULTS,
  })

  const { fields: quals, append: appendQual, remove: removeQual } = useFieldArray({
    control,
    name: 'qualifications',
  })

  function openAdd() {
    reset(DEFAULTS)
    setPassportCopy(undefined)
    setEditingId(null)
    setModalOpen(true)
  }

  function openEdit(member: CrewMember) {
    reset({
      firstName: member.firstName, lastName: member.lastName,
      dateOfBirth: member.dateOfBirth, nationality: member.nationality,
      passportNumber: member.passportNumber, passportExpiry: member.passportExpiry,
      street: member.street, city: member.city, postCode: member.postCode, country: member.country,
      phone: member.phone, email: member.email,
      emergencyContact: member.emergencyContact, emergencyPhone: member.emergencyPhone,
      bloodType: member.bloodType, medications: member.medications, allergies: member.allergies,
      qualifications: member.qualifications ?? [],
      role: member.role,
      isActive: member.isActive,
    })
    setPassportCopy(member.passportCopy)
    setEditingId(member.id!)
    setModalOpen(true)
  }

  async function onSubmit(data: FormData) {
    setSaving(true)
    try {
      const now = new Date().toISOString()
      const memberData = { ...data, passportCopy }
      if (editingId) {
        await db.crew.update(editingId, { ...memberData, updatedAt: now })
      } else {
        await db.crew.add({ ...memberData, createdAt: now, updatedAt: now })
      }
      setSaved(true)
      setTimeout(() => { setSaved(false); setModalOpen(false) }, 500)
    } finally {
      setSaving(false)
    }
  }

  async function executeDeleteMember() {
    if (deleteConfirmId === null) return
    const id = deleteConfirmId
    setDeleteConfirmId(null)
    await db.crew.delete(id)
    toast.success(t('crew.deleted'))
  }

  const roleOptions = [
    { value: 'skipper', label: t('crew.roles.skipper') },
    { value: 'crew', label: t('crew.roles.crew') },
    { value: 'passenger', label: t('crew.roles.passenger') },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 p-3 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700">
        <span className="text-base font-semibold text-gray-900 dark:text-gray-100 flex-shrink-0">{t('nav.crew')}</span>
        {inactiveCount > 0 && (
          <>
            <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 flex-shrink-0" />
            <button
              onClick={() => setShowInactive(v => !v)}
              className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 underline-offset-2 hover:underline flex-shrink-0"
            >
              {showInactive ? t('crew.hideInactive') : t('crew.showInactive', { count: inactiveCount })}
            </button>
          </>
        )}
        <div className="flex-1" />
        <Button icon={<PlusCircle className="w-4 h-4" />} onClick={openAdd}>
          {t('crew.addMember')}
        </Button>
      </div>

      {sortedCrew.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {visibleCrew.map(member => (
            <Card key={member.id} padding={false} className={`flex flex-col${!member.isActive ? ' opacity-60' : ''}`}>
              <div className="p-4 flex-1 flex flex-col">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-lg">{member.firstName} {member.lastName}</h3>
                    <p className="text-sm text-gray-500">{member.nationality}</p>
                  </div>
                  <div className="flex flex-col gap-1 items-end">
                    <Badge variant={member.role === 'skipper' ? 'info' : 'default'}>
                      {t(`crew.roles.${member.role}`)}
                    </Badge>
                    <Badge variant={member.isActive ? 'success' : 'default'}>
                      {member.isActive ? t('crew.active') : t('crew.inactive')}
                    </Badge>
                  </div>
                </div>
                {member.passportCopy && (
                  member.passportCopy.startsWith('data:application/pdf')
                    ? <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-950 rounded-lg text-sm text-blue-700 dark:text-blue-300">
                        <FileText className="w-4 h-4 flex-shrink-0" />
                        <span>{t('crew.travelDocPdf')}</span>
                      </div>
                    : <img src={member.passportCopy} alt="Passport" className="mt-3 w-full h-24 object-cover rounded-lg" />
                )}
                <div className="mt-auto pt-3 space-y-1 text-sm">
                  <div className="flex justify-between text-gray-600 dark:text-gray-400">
                    <span>{t('crew.passportNumber')}</span>
                    <span className="font-mono">{member.passportNumber || '—'}</span>
                  </div>
                </div>
                {member.qualifications?.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {member.qualifications.map((q, i) => (
                      <span key={i} className="text-xs bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full">
                        {q.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex border-t border-gray-100 dark:border-gray-700">
                <button onClick={() => openEdit(member)} className="flex-1 p-2 text-sm text-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center justify-center gap-1.5">
                  <Edit className="w-3.5 h-3.5" /> {t('common.edit')}
                </button>
                <button onClick={() => setDeleteConfirmId(member.id!)} className="flex-1 p-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950 flex items-center justify-center gap-1.5 border-l border-gray-100 dark:border-gray-700">
                  <Trash2 className="w-3.5 h-3.5" /> {t('common.delete')}
                </button>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-16">
          <Users className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <p className="text-gray-500 mb-4">{t('crew.noCrewMembers')}</p>
          <Button onClick={openAdd}>{t('crew.addMember')}</Button>
        </div>
      )}
      {sortedCrew.length > 0 && !showInactive && inactiveCount > 0 && visibleCrew.length === 0 && (
        <div className="text-center py-8 text-gray-400 text-sm">
          {t('crew.allInactive')}{' '}
          <button onClick={() => setShowInactive(true)} className="text-blue-600 hover:underline">{t('crew.showAll')}</button>
        </div>
      )}

      {/* Delete confirmation modal */}
      <Modal
        isOpen={deleteConfirmId !== null}
        onClose={() => setDeleteConfirmId(null)}
        title={t('crew.deleteConfirmTitle')}
        size="sm"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setDeleteConfirmId(null)}>{t('common.cancel')}</Button>
            <Button variant="danger" size="sm" icon={<Trash2 className="w-4 h-4" />} onClick={executeDeleteMember}>{t('common.delete')}</Button>
          </>
        }
      >
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-gray-700 dark:text-gray-300">{t('crew.deleteConfirmText')}</p>
        </div>
      </Modal>

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? t('crew.editMember') : t('crew.addMember')}
        size="xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>{t('common.cancel')}</Button>
            <Button onClick={handleSubmit(onSubmit)} loading={saving} icon={<Save className="w-4 h-4" />}>
              {saved ? t('common.saved') : t('common.save')}
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div>
            <h4 className="font-semibold text-sm text-gray-700 dark:text-gray-300 mb-3">{t('crew.personal')}</h4>
            <div className="grid grid-cols-2 gap-4">
              <Input label={t('crew.firstName')} {...register('firstName')} error={errors.firstName?.message} required />
              <Input label={t('crew.lastName')} {...register('lastName')} error={errors.lastName?.message} required />
              <Input label={t('crew.dateOfBirth')} type="date" {...register('dateOfBirth')} required />
              <Controller name="nationality" control={control} render={({ field }) => (
                <CountrySelect label={t('crew.nationality')} valueType="name" value={field.value} onChange={field.onChange} onBlur={field.onBlur} required />
              )} />
            </div>
          </div>
          <div>
            <h4 className="font-semibold text-sm text-gray-700 dark:text-gray-300 mb-3">{t('crew.passport')}</h4>
            <div className="grid grid-cols-2 gap-4 mb-3">
              <Input label={t('crew.passportNumber')} {...register('passportNumber')} />
              <Input label={t('crew.passportExpiry')} type="date" {...register('passportExpiry')} />
            </div>
            <FileUpload
              label={t('crew.passportCopy')}
              disabled={!!import.meta.env.VITE_GH_PAGES}
              attachments={passportCopy ? [{
                id: '1',
                name: passportCopy.startsWith('data:application/pdf') ? 'TravelDocument.pdf' : 'TravelDocument.jpg',
                type: passportCopy.startsWith('data:application/pdf') ? 'application/pdf' : 'image/jpeg',
                data: passportCopy,
                size: 0,
                uploadedAt: '',
              }] : []}
              onUpload={(att) => setPassportCopy(att.data)}
              onRemove={() => setPassportCopy(undefined)}
              accept="image/*,application/pdf"
            />
          </div>
          <div>
            <h4 className="font-semibold text-sm text-gray-700 dark:text-gray-300 mb-3">{t('crew.address')}</h4>
            <div className="grid grid-cols-2 gap-4">
              <Input label={t('crew.street')} {...register('street')} />
              <Input label={t('crew.city')} {...register('city')} />
              <Input label={t('crew.postCode')} {...register('postCode')} />
              <Controller name="country" control={control} render={({ field }) => (
                <CountrySelect label={t('crew.country')} valueType="name" value={field.value} onChange={field.onChange} onBlur={field.onBlur} />
              )} />
            </div>
          </div>
          <div>
            <h4 className="font-semibold text-sm text-gray-700 dark:text-gray-300 mb-3">{t('crew.contact')}</h4>
            <div className="grid grid-cols-2 gap-4">
              <Input label={t('crew.phone')} {...register('phone')} />
              <Input label={t('crew.email')} type="email" {...register('email')} />
              <Input label={t('crew.emergencyContact')} {...register('emergencyContact')} />
              <Input label={t('crew.emergencyPhone')} {...register('emergencyPhone')} />
            </div>
          </div>
          <div>
            <h4 className="font-semibold text-sm text-gray-700 dark:text-gray-300 mb-3">{t('crew.medical')}</h4>
            <div className="grid grid-cols-3 gap-4">
              <Select
                label={t('crew.bloodType')}
                options={[
                  { value: '', label: '—' },
                  { value: 'A+', label: 'A+' },
                  { value: 'A-', label: 'A−' },
                  { value: 'B+', label: 'B+' },
                  { value: 'B-', label: 'B−' },
                  { value: 'AB+', label: 'AB+' },
                  { value: 'AB-', label: 'AB−' },
                  { value: 'O+', label: 'O+' },
                  { value: 'O-', label: 'O−' },
                ]}
                {...register('bloodType')}
              />
              <Input label={t('crew.medications')} {...register('medications')} />
              <Input label={t('crew.allergies')} {...register('allergies')} />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-semibold text-sm text-gray-700 dark:text-gray-300">{t('crew.qualifications')}</h4>
              <button
                type="button"
                onClick={() => appendQual({ name: '', issuedBy: '', issuedDate: '', number: '' })}
                className="text-xs text-blue-600 hover:underline flex items-center gap-1"
              >
                <PlusCircle className="w-3 h-3" /> {t('crew.addQualification')}
              </button>
            </div>
            <div className="space-y-3">
              {quals.map((qual, i) => (
                <div key={qual.id} className="grid grid-cols-4 gap-2 items-end">
                  <Input label={t('crew.certName')} {...register(`qualifications.${i}.name`)} />
                  <Input label={t('crew.certIssuedBy')} {...register(`qualifications.${i}.issuedBy`)} />
                  <Input label={t('crew.certIssuedDate')} type="date" {...register(`qualifications.${i}.issuedDate`)} />
                  <div className="flex gap-2 items-end">
                    <Input label={t('crew.certNumber')} {...register(`qualifications.${i}.number`)} />
                    <button type="button" onClick={() => removeQual(i)} className="mb-0.5 p-1.5 text-red-500 hover:bg-red-50 rounded">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h4 className="font-semibold text-sm text-gray-700 dark:text-gray-300 mb-3">{t('crew.role')}</h4>
            <div className="grid grid-cols-2 gap-4">
              <Select label={t('crew.role')} options={roleOptions} {...register('role')} />
              <div>
                <label className="label">{t('crew.active')}</label>
                <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 h-[38px]">
                  <button
                    type="button"
                    onClick={() => setValue('isActive', true)}
                    className={`flex-1 flex items-center justify-center gap-1.5 text-sm font-medium transition-colors ${
                      watch('isActive')
                        ? 'bg-green-500 text-white'
                        : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-green-50 dark:hover:bg-green-950/40'
                    }`}
                  >
                    <span className="text-base leading-none">{watch('isActive') ? '●' : '○'}</span>
                    {t('crew.active')}
                  </button>
                  <div className="w-px bg-gray-200 dark:bg-gray-700 flex-shrink-0" />
                  <button
                    type="button"
                    onClick={() => setValue('isActive', false)}
                    className={`flex-1 flex items-center justify-center gap-1.5 text-sm font-medium transition-colors ${
                      !watch('isActive')
                        ? 'bg-gray-500 text-white'
                        : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    <span className="text-base leading-none">{!watch('isActive') ? '●' : '○'}</span>
                    {t('crew.inactive')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  )
}
